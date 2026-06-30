import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/response";
import { verifySignature, getMessageContent, getGroupMemberName, getGroupName } from "../lib/line";
import { sha256 } from "../lib/hash";
import { dateOnly } from "../lib/date";
import { storeSlip } from "../services/storage";
import { getOcrService, detectImageMime, mimeExt } from "../services/ocr";
import { processSubmission } from "../services/payment";
import { effectiveRetentionDaysForOrg, purgeSlipImage } from "../services/retention";
import { captureError } from "../lib/logger";
import { env } from "../env";
import {
  sendAndLog,
  renderTextHelp,
  renderCustomerBalance,
  renderDuplicateSlip,
  renderUnsupportedSlip,
  renderRateLimited,
  renderNeedsAdminMatch,
} from "../services/messages";

type Oa = { id: string; orgId: string; channelSecret: string; channelAccessToken: string };

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
        if (ev.type !== "message") continue;
        if (ev.message?.type === "image") await handleImage(ev, oa);
        else await handleNonImage(ev, oa);
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

async function handleNonImage(ev: any, oa: Oa) {
  // In a group, stay quiet on non-image messages (don't spam the group). Only help in 1:1.
  if (groupOf(ev)) return;
  const lineUserId: string | undefined = ev.source?.userId;
  const customer = await findCustomer(oa.id, lineUserId);
  const text: string = ev.message?.type === "text" ? ev.message.text ?? "" : "";

  // Self-service balance check: linked customer types "ยอด / คงเหลือ / เช็ค / ค้าง / balance".
  let reply = renderTextHelp();
  let messageType = "text_help";
  if (customer && /ยอด|คงเหลือ|เช็ค|ค้าง|balance/i.test(text)) {
    const b = await customerBalance(customer.id);
    reply = renderCustomerBalance(b.outstanding, b.count, b.nextDue);
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

async function handleImage(ev: any, oa: Oa) {
  const lineUserId: string | undefined = ev.source?.userId;
  const groupId = groupOf(ev);
  const messageId: string = ev.message.id;
  // Group slips come from staff/collectors — not tied to a specific customer (matched org-wide).
  const customer = groupId ? null : await findCustomer(oa.id, lineUserId);
  const senderName = groupId ? await resolveSenderName(oa, ev.source) : null;
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

  if (lineUserId && (await overRateLimit(oa.id, lineUserId))) {
    await reply(renderRateLimited(), "payment_rate_limited");
    return;
  }

  const buffer = await getMessageContent(messageId, oa.channelAccessToken);
  const imageHash = sha256(buffer);

  const dup = await prisma.paymentSubmission.findFirst({ where: { lineOaId: oa.id, imageHash } });
  if (dup) {
    await reply(renderDuplicateSlip(), "payment_received", dup.id);
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
  const imageUrl = await storeSlip(sub.id, buffer, ext);

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
    await reply(badType ? renderUnsupportedSlip() : renderNeedsAdminMatch(), "payment_need_admin", sub.id);
    return;
  }

  let ocr;
  try {
    ocr = await getOcrService().parseSlip(imageUrl, buffer);
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
      parsedAmount: ocr.amount,
      parsedTransferDate: ocr.transferDate ? dateOnly(ocr.transferDate) : null,
      parsedTransferTime: ocr.transferTime,
      parsedBankName: ocr.bankName,
      parsedAccountNo: ocr.accountNo,
      parsedReferenceNo: ocr.referenceNo,
    },
  });

  await processSubmission(sub.id);

  // Retention = 0 days means "purge right after processing". Never let a purge failure
  // (missing file, disk error) break the submission that was just recorded.
  try {
    if ((await effectiveRetentionDaysForOrg(oa.orgId)) === 0) await purgeSlipImage(sub.id);
  } catch (e) {
    captureError(e, { scope: "purge_slip_immediate", submissionId: sub.id });
  }
}
