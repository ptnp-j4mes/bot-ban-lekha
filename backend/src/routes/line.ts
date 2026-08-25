import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/response";
import type { Prisma } from "@prisma/client";
import { verifySignature, getMessageContent, getGroupMemberName, getGroupName, getUserProfile } from "../lib/line";
import { sha256 } from "../lib/hash";
import { dateOnly } from "../lib/date";
import { storeSlip } from "../services/storage";
import { getOcrService, detectImageMime, mimeExt } from "../services/ocr";
import { processSubmission } from "../services/payment";
import { renderCustomerOpenBills } from "../services/bill";
import { effectiveRetentionDaysForOrg, purgeSlipImage } from "../services/retention";
import { audit } from "../services/audit";
import { captureError } from "../lib/logger";
import { env } from "../env";
import {
  sendAndLog,
  renderTextHelp,
  renderCustomerBalance,
  renderCustomerBills,
  renderDuplicateSlip,
  renderUnsupportedSlip,
  renderRateLimited,
  renderNeedsAdminMatch,
  getOrgMessageTemplates,
  getOrgMessageConfig,
  renderCustomMessage,
} from "../services/messages";

type Oa = { id: string; orgId: string; channelSecret: string; channelAccessToken: string };
type InboundContext = { customer: any | null; senderName: string | null; userName: string | null };

export const lineRoutes = new Elysia().post(
  // One webhook URL per OA. Each LINE OA is configured with /api/line/webhook/<its id>.
  "/api/line/webhook/:oaId",
  async ({ params, body, headers }: any) => {
    const oa = await prisma.lineOaAccount.findUnique({ where: { id: params.oaId } });
    if (!oa || !oa.isActive) throw new ApiError("NOT_FOUND", "Unknown or inactive LINE OA");

    // Security: verify signature with THIS OA's channel secret (skip only if unset, dev).
    if (oa.channelSecret) {
      if (!verifySignature(body.__raw ?? "", headers["x-line-signature"], oa.channelSecret))
        throw new ApiError("UNAUTHORIZED", "Invalid LINE signature");
    }
    const events: any[] = body.events ?? [];
    for (const ev of events) {
      try {
        const context = await resolveInboundContext(oa, ev);
        try {
          await recordInboundEvent(oa, ev, context);
        } catch (error) {
          // Logging must never stop the actual webhook workflow.
          captureError(error, { scope: "inbound_message_log", oaId: oa.id, eventType: ev.type });
        }
        if (ev.type !== "message") continue;
        if (ev.message?.type === "image") await handleImage(ev, oa, context);
        else await handleNonImage(ev, oa, context);
      } catch (e) {
        captureError(e, { scope: "webhook_event", oaId: oa.id, eventType: ev.type });
      }
    }
    return { success: true, data: { received: events.length }, message: "success" };
  },
  {
    parse: async ({ request }: any) => {
      const raw = await request.text();
      let parsed: any = {};
      try {
        parsed = JSON.parse(raw);
      } catch {}
      return { __raw: raw, ...parsed };
    },
  }
);

const findCustomer = (oaId: string, lineUserId?: string) =>
  lineUserId ? prisma.customer.findFirst({ where: { lineOaId: oaId, lineUserId } }) : Promise.resolve(null);

const groupOf = (ev: any): string | undefined => ev.source?.groupId ?? ev.source?.roomId;

async function ensureAutoCustomer(oa: Oa, lineUserId: string, displayName: string | null): Promise<any> {
  const name = displayName?.trim() || lineUserId;
  const codeBase = `LINE-${lineUserId.slice(-8).toUpperCase()}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const customerCode = attempt === 0 ? codeBase : `${codeBase}-${attempt + 1}`;
    try {
      const customer = await prisma.customer.create({
        data: {
          orgId: oa.orgId,
          lineOaId: oa.id,
          lineUserId,
          customerCode,
          displayName: name,
        },
      });
      await prisma.paymentSubmission.updateMany({
        where: { orgId: oa.orgId, lineOaId: oa.id, lineUserId, customerId: null },
        data: { customerId: customer.id, senderName: name },
      });
      try {
        await audit(prisma, {
          action: "auto_create_customer_from_line",
          entityType: "customer",
          entityId: customer.id,
          orgId: oa.orgId,
          actorType: "line_user",
          actorId: lineUserId,
          newValue: { customerCode, displayName: name, lineOaId: oa.id },
        });
      } catch (error) {
        captureError(error, { scope: "auto_customer_audit", oaId: oa.id, customerId: customer.id });
      }
      return customer;
    } catch (error: any) {
      if (error?.code !== "P2002") throw error;
      const existing = await findCustomer(oa.id, lineUserId);
      if (existing) return existing;
    }
  }
  throw new Error("Could not generate a unique customer code");
}

async function resolveInboundContext(oa: Oa, ev: any): Promise<InboundContext> {
  const lineUserId: string | undefined = ev.source?.userId;
  const groupId = groupOf(ev);
  let customer = ev.type === "message" && !groupId ? await findCustomer(oa.id, lineUserId) : null;
  const senderName = groupId ? await resolveSenderName(oa, ev.source) : null;
  let userName = senderName ?? customer?.displayName ?? customer?.customerCode ?? null;
  if (!userName && lineUserId && !groupId) userName = await getUserProfile(lineUserId, oa.channelAccessToken);
  if (!customer && ev.type === "message" && lineUserId && !groupId) {
    const createdCustomer = await ensureAutoCustomer(oa, lineUserId, userName);
    customer = createdCustomer;
    userName = userName ?? createdCustomer.displayName ?? createdCustomer.customerCode;
  }
  if (customer && userName && !customer.displayName && userName !== customer.customerCode) {
    await prisma.customer.update({ where: { id: customer.id }, data: { displayName: userName } });
    customer.displayName = userName;
  }
  return { customer, senderName, userName };
}

async function recordInboundEvent(oa: Oa, ev: any, context: InboundContext) {
  const messageType = ev.message?.type ?? ev.type ?? "unknown";
  const messageText = ev.message?.type === "text"
    ? ev.message.text ?? ""
    : ev.message?.type === "image"
      ? "[image]"
      : ev.message?.type
        ? `[${ev.message.type}]`
        : `[${ev.type ?? "event"}]`;
  const { replyToken: _replyToken, ...safeEvent } = ev;
  await prisma.messageLog.create({
    data: {
      orgId: oa.orgId,
      lineOaId: oa.id,
      customerId: context.customer?.id ?? undefined,
      lineUserId: ev.source?.userId ?? undefined,
      direction: "inbound",
      sourceType: ev.source?.type ?? undefined,
      sourceName: context.userName ?? undefined,
      lineMessageId: ev.message?.id ?? undefined,
      messageType: `inbound_${messageType}`,
      messageText,
      lineEvent: safeEvent as Prisma.InputJsonValue,
      status: "received",
    },
  });
}

// Resolve (and remember) the slip sender's name, so admins can track who submitted it.
async function resolveSenderName(oa: Oa, source: any): Promise<string | null> {
  const userId: string | undefined = source?.userId;
  if (!userId) return null;
  const existing = await prisma.lineSender.findUnique({ where: { orgId_lineUserId: { orgId: oa.orgId, lineUserId: userId } } });
  if (existing) return existing.name;
  const lineName = (await getGroupMemberName(source, oa.channelAccessToken)) ?? userId.slice(0, 10);
  const created = await prisma.lineSender.create({ data: { orgId: oa.orgId, lineUserId: userId, name: lineName } });
  return created.name;
}

// Remember each group the bot collects from (for the per-group daily report).
async function ensureGroup(oa: Oa, groupId: string) {
  const existing = await prisma.lineGroup.findUnique({ where: { orgId_lineGroupId: { orgId: oa.orgId, lineGroupId: groupId } } });
  if (existing) return;
  const name = (await getGroupName(groupId, oa.channelAccessToken)) ?? `กลุ่ม ${groupId.slice(0, 8)}`;
  await prisma.lineGroup.create({ data: { orgId: oa.orgId, lineGroupId: groupId, name } });
}

// Outstanding (unpaid) balance for a linked customer.
export async function customerBalance(customerId: string) {
  const insts = await prisma.billInstallment.findMany({
    where: { status: { notIn: ["paid", "cancelled"] }, billPlan: { customerId, status: "active" } },
    select: { amountDue: true, amountPaid: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });
  const outstanding = insts.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0);
  return { outstanding, count: insts.length, nextDue: insts[0]?.dueDate ?? null };
}

async function handleNonImage(ev: any, oa: Oa, context: InboundContext) {
  // In a group, stay quiet on non-image messages (don't spam the group). Only help in 1:1.
  if (groupOf(ev)) return;
  const lineUserId: string | undefined = ev.source?.userId;
  const customer = context.customer;
  const text: string = ev.message?.type === "text" ? ev.message.text ?? "" : "";
  const config = await getOrgMessageConfig(oa.orgId);
  const templates = config.templates;

  const isBillMenu = text.trim() === "บิล";
  const custom = config.customMessages.find((m) => m.enabled && text.toLocaleLowerCase().includes(m.trigger.toLocaleLowerCase()));
  let reply = custom ? renderCustomMessage(custom.text, customer?.displayName || context.userName) : renderTextHelp(templates);
  let messageType = "text_help";
  if (customer && isBillMenu) {
    const bill = await renderCustomerOpenBills(prisma, customer.id, oa.orgId);
    reply = bill.text ? renderCustomerBills(bill.text, templates) : renderCustomerBalance(0, 0, null, templates);
    messageType = "bill_inquiry";
  } else if (custom) {
    messageType = `custom_${custom.id}`;
  } else if (customer && /ยอด|คงเหลือ|เช็ค|ค้าง|balance/i.test(text)) {
    const b = await customerBalance(customer.id);
    reply = renderCustomerBalance(b.outstanding, b.count, b.nextDue, templates);
    messageType = "balance_inquiry";
  }

  await sendAndLog(prisma, {
    lineUserId,
    text: reply,
    messageType,
    accessToken: oa.channelAccessToken,
    orgId: oa.orgId,
    lineOaId: oa.id,
    customerId: customer?.id,
  });
}

// Rate limit per (OA, line_user_id) within a rolling window.
async function overRateLimit(oaId: string, lineUserId: string): Promise<boolean> {
  const since = new Date(Date.now() - env.ocrRateWindowSec * 1000);
  const n = await prisma.paymentSubmission.count({ where: { lineOaId: oaId, lineUserId, createdAt: { gte: since } } });
  return n >= env.ocrRateMax;
}

async function handleImage(ev: any, oa: Oa, context: InboundContext) {
  const lineUserId: string | undefined = ev.source?.userId;
  const groupId = groupOf(ev);
  const messageId: string = ev.message.id;
  // Group slips come from staff/collectors — not tied to a specific customer (matched org-wide).
  const customer = groupId ? null : context.customer;
  const senderName = groupId ? context.senderName : context.userName;
  const templates = await getOrgMessageTemplates(oa.orgId);
  if (groupId) await ensureGroup(oa, groupId);
  const replyTo = groupId ?? lineUserId; // push back to the group, or the 1:1 chat
  const reply = (text: string, messageType: string, paymentSubmissionId?: string) =>
    sendAndLog(prisma, {
      lineUserId: replyTo,
      text,
      messageType,
      accessToken: oa.channelAccessToken,
      orgId: oa.orgId,
      lineOaId: oa.id,
      customerId: customer?.id,
      paymentSubmissionId,
    });

  if (env.ocrGuardsEnabled && lineUserId && (await overRateLimit(oa.id, lineUserId))) {
    await reply(renderRateLimited(templates), "payment_rate_limited");
    return;
  }

  const buffer = await getMessageContent(messageId, oa.channelAccessToken);
  const imageHash = sha256(buffer);

  const dup = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id, imageHash } });
  if (dup) {
    await reply(renderDuplicateSlip(templates), "payment_received", dup.id);
    return;
  }

  const mime = detectImageMime(buffer);
  const badType = env.ocrProvider !== "mock" && !mime;
  const tooBig = buffer.length > env.maxSlipMb * 1024 * 1024;
  const ext = mime ? mimeExt(mime) : "bin";

  const sub = await prisma.paymentSubmission.create({
    data: {
      orgId: oa.orgId,
      lineOaId: oa.id,
      customerId: customer?.id,
      lineUserId,
      senderName,
      lineGroupId: groupId,
      lineMessageId: messageId,
      originalFileName: `${messageId}.${ext}`,
      imageHash,
      ocrStatus: "processing",
    },
  });
  const imageUrl = await storeSlip(oa.orgId, oa.id, sub.id, buffer, ext, {
    userId: lineUserId,
    userName: senderName,
  });

  if (badType || tooBig) {
    await prisma.paymentSubmission.update({
      where: { id: sub.id },
      data: {
        imageUrl,
        ocrStatus: "failed",
        matchStatus: "needs_admin_match",
        matchReason: badType ? "ชนิดไฟล์ไม่รองรับ" : `ไฟล์ใหญ่เกิน ${env.maxSlipMb}MB`,
      },
    });
    await reply(badType ? renderUnsupportedSlip(templates) : renderNeedsAdminMatch(templates), "payment_need_admin", sub.id);
    return;
  }

  let ocr;
  try {
    ocr = await getOcrService().parseSlip(buffer);
  } catch {
    ocr = { rawText: "", confidence: 0 } as any;
  }
  const gotFields = ocr.amount != null || !!ocr.transferDate;

  await prisma.paymentSubmission.update({
    where: { id: sub.id },
    data: {
      imageUrl,
      ocrStatus: gotFields ? "success" : "failed",
      ocrRawText: ocr.rawText,
      docType: ocr.docType ?? null,
      parsedAmount: ocr.amount,
      parsedTransferDate: ocr.transferDate ? dateOnly(ocr.transferDate) : null,
      parsedTransferTime: ocr.transferTime,
      parsedBankName: ocr.bankName,
      parsedAccountNo: ocr.accountNo,
      parsedReferenceNo: ocr.referenceNo,
    },
  });

  await processSubmission(sub.id);

  // Retention 0 = purge the local file right away. Never let a purge failure affect the
  // submission/webhook — the slip stays on disk (swept later by the scheduled job) on error.
  try {
    if ((await effectiveRetentionDaysForOrg(oa.orgId)) === 0) await purgeSlipImage(sub.id);
  } catch (e) {
    captureError(e, { scope: "immediate_purge", submissionId: sub.id });
  }
}
