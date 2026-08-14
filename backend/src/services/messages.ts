import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { toEmojiNumber } from "../lib/emoji-number";
import { dayOfMonth, thaiMonth, beYear2 } from "../lib/date";
import { pushMessage } from "../lib/line";
import { env } from "../env";

type Tx = PrismaClient | Prisma.TransactionClient;

export const fmtAmount = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type InstallmentView = { dueDate: Date; amountDue: number; status: string; penaltyAmount?: number };
type BankView = { accountNo: string; bankName: string; accountName: string } | null;

export const MESSAGE_TEMPLATE_KEYS = [
  "text_help",
  "customer_balance_empty",
  "customer_balance_due",
  "payment_received",
  "cash_bill_received",
  "needs_admin_match",
  "payment_approved",
  "payment_rejected",
  "duplicate_slip",
  "unsupported_slip",
  "rate_limited",
] as const;
export type MessageTemplateKey = (typeof MESSAGE_TEMPLATE_KEYS)[number];
export type MessageTemplates = Record<MessageTemplateKey, string>;
export type CustomMessageTemplate = { id: string; name: string; trigger: string; text: string; enabled: boolean };

export const DEFAULT_MESSAGE_TEMPLATES: MessageTemplates = {
  text_help: `สวัสดีค่ะ 🙏\nหากต้องการแจ้งชำระเงิน กรุณาส่ง "รูปสลิป" โอนเงินเข้ามาในแชทนี้ได้เลยค่ะ\nหรือพิมพ์ "ยอด" เพื่อเช็คยอดค้างชำระค่ะ`,
  customer_balance_empty: `คุณไม่มียอดค้างชำระค่ะ ✅ ขอบคุณค่ะ 🙏`,
  customer_balance_due: `ยอดค้างชำระของคุณ 💰\n\nคงเหลือ {outstanding} บาท ({count} งวด)\nงวดถัดไปครบกำหนด {next_due}\n\nหากต้องการแจ้งชำระ ส่งรูปสลิปเข้ามาได้เลยค่ะ 🙏`,
  payment_received: `📌 ได้รับสลิปแล้วค่ะ\n\nระบบกำลังตรวจสอบยอดชำระ\nหากตรวจสอบเรียบร้อยแล้ว จะแจ้งสถานะกลับทางแชทนี้ค่ะ 🙏`,
  cash_bill_received: `รับบิลเงินสดแล้วค่ะ 🧾\nเจ้าหน้าที่จะตรวจสอบและยืนยันยอดให้นะคะ 🙏`,
  needs_admin_match: `📌 ได้รับสลิปแล้วค่ะ\n\nระบบยังไม่สามารถจับคู่ยอดกับงวดในบิลได้อัตโนมัติ\nแอดมินจะตรวจสอบและอัปเดตสถานะให้ค่ะ 🙏`,
  payment_approved: `รับยอดค่ะ✅\n\n{bill_text}`,
  payment_rejected: `ขออภัยค่ะ สลิปที่ส่งมายังไม่สามารถยืนยันยอดได้\n\nเหตุผล: {reason}\n\nกรุณาตรวจสอบและส่งสลิปใหม่อีกครั้งค่ะ`,
  duplicate_slip: `📌 สลิปนี้เคยส่งเข้ามาแล้วค่ะ\nระบบกำลังตรวจสอบรายการเดิมอยู่ ไม่ต้องส่งซ้ำนะคะ 🙏`,
  unsupported_slip: `ขออภัยค่ะ ไฟล์ที่ส่งมาไม่สามารถอ่านเป็นสลิปได้\nกรุณาส่งเป็นรูปภาพสลิป (jpg, png, webp) อีกครั้งค่ะ`,
  rate_limited: `ขออภัยค่ะ คุณส่งสลิปเข้ามาบ่อยเกินไป\nกรุณารอสักครู่แล้วลองใหม่อีกครั้งค่ะ`,
};

export function normalizeCustomMessageTemplates(raw: unknown): CustomMessageTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item: any, index) => {
    if (!item || typeof item !== "object") return [];
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim().slice(0, 80) : `custom-${index + 1}`;
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 120) : "";
    const trigger = typeof item.trigger === "string" ? item.trigger.trim().slice(0, 120) : "";
    const text = typeof item.text === "string" ? item.text.slice(0, 4000) : "";
    if (!name || !trigger || !text.trim()) return [];
    return [{ id, name, trigger, text, enabled: item.enabled !== false }];
  });
}

export function mergeMessageTemplates(raw: unknown): MessageTemplates {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return Object.fromEntries(MESSAGE_TEMPLATE_KEYS.map((key) => [
    key,
    typeof source[key] === "string" && source[key].trim() ? source[key] : DEFAULT_MESSAGE_TEMPLATES[key],
  ])) as MessageTemplates;
}

export async function getOrgMessageTemplates(orgId: string | null | undefined): Promise<MessageTemplates> {
  if (!orgId) return DEFAULT_MESSAGE_TEMPLATES;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { messageTemplates: true } });
  return mergeMessageTemplates(org?.messageTemplates);
}

export async function getOrgMessageConfig(orgId: string | null | undefined): Promise<{ templates: MessageTemplates; customMessages: CustomMessageTemplate[] }> {
  if (!orgId) return { templates: DEFAULT_MESSAGE_TEMPLATES, customMessages: [] };
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { messageTemplates: true } });
  const raw = org?.messageTemplates as any;
  return { templates: mergeMessageTemplates(raw), customMessages: normalizeCustomMessageTemplates(raw?.custom_messages) };
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{([a-z_]+)\}/g, (_, key) => values[key] == null ? "" : String(values[key]));

export const renderCustomMessage = (template: string, customerName?: string | null) =>
  fill(template, { customer_name: customerName?.trim() || "ลูกค้า" });

// `15💸 490✅` (paid) / `29💸 490` (unpaid) — 💸 stays, ✅ appended when paid.
export function renderBillStatusLines(installments: InstallmentView[]): string {
  return installments
    .map((i) => {
      const penalty = Number(i.penaltyAmount ?? 0);
      const penaltyText = penalty > 0 ? `🔴ปรับ${fmtAmount(penalty)}` : "";
      return `${dayOfMonth(i.dueDate)}💸 ${fmtAmount(i.amountDue)}${i.status === "paid" ? "✅" : ""}${penaltyText}`;
    })
    .join("\n");
}

export function renderDailyReminder(dueDate: Date): string {
  const d = `${toEmojiNumber(dayOfMonth(dueDate))} ${thaiMonth(dueDate)} ${toEmojiNumber(beYear2(dueDate))}`;
  return (
    `💸💸 วันนี้มีชำระยอดประจำงวดวันที่ ${d} นะคะ 💸💸\n\n` +
    `กรุณาชำระภายในเวลา 17.00 น.\n\n` +
    `หากชำระแล้ว สามารถส่งสลิปกลับมาในแชทนี้ได้เลยค่ะ 🙏`
  );
}

export function renderBillText(args: {
  billNo: number;
  principal: number;
  installmentAmount: number;
  cycleDays: number | null;
  totalInstallments: number;
  installments: InstallmentView[];
  bank: BankView;
  billPenaltyAmount?: number | null;
  note?: string | null;
  footer?: string | null; // per-org override; falls back to env default
}): string {
  // Prefer the admin's own bill note (verbatim, as typed in the group); fall back to generated text.
  const head =
    args.note?.trim() ||
    (args.cycleDays != null
      ? `ต้น ${fmtAmount(args.principal)} ส่ง ${fmtAmount(args.installmentAmount)} ทุก ${args.cycleDays} วัน ${args.totalInstallments} งวดจบ`
      : `ต้น ${fmtAmount(args.principal)} ${args.totalInstallments} งวดจบ`);
  const bank = args.bank
    ? `\n\n💸 ช่องทางการโอนเงิน 💸\n\nเลขที่บัญชี ${args.bank.accountNo}\n${args.bank.bankName}\nชื่อบัญชี ${args.bank.accountName}`
    : "";
  const billPenalty = Number(args.billPenaltyAmount ?? 0);
  const billPenaltyText = billPenalty > 0 ? `\n\n🔴ค่าปรับหัวบิล ${fmtAmount(billPenalty)}` : "";
  return (
    `บิล ${toEmojiNumber(args.billNo)}\n\n` +
    `${head}\n\n` +
    `${renderBillStatusLines(args.installments)}\n\n` +
    `จบ🙏` +
    billPenaltyText +
    bank +
    `\n\n${args.footer?.trim() || env.billFooter}`
  );
}

export const renderPaymentReceived = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.payment_received;

export const renderCashBillReceived = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.cash_bill_received;

export const renderNeedsAdminMatch = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.needs_admin_match;

// Approval reply = "รับยอดค่ะ✅" header followed by the latest full bill (with ✅ on paid rows).
export const renderPaymentApproved = (billText: string, templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => fill(templates.payment_approved, { bill_text: billText });

export const renderTextHelp = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.text_help;

export const renderCustomerBalance = (outstanding: number, count: number, nextDue: Date | null, templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) =>
  count === 0
    ? templates.customer_balance_empty
    : fill(templates.customer_balance_due, {
      outstanding: fmtAmount(outstanding),
      count,
      next_due: nextDue ? `${dayOfMonth(nextDue)} ${thaiMonth(nextDue)} ${beYear2(nextDue)}` : "—",
    });

export const renderDuplicateSlip = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.duplicate_slip;

export const renderUnsupportedSlip = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.unsupported_slip;

export const renderRateLimited = (templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => templates.rate_limited;

export const renderPaymentRejected = (reason: string, templates: MessageTemplates = DEFAULT_MESSAGE_TEMPLATES) => fill(templates.payment_rejected, { reason });

// Send a LINE push (using the OA's access token) and record a message_log row.
// Never throws on LINE failure — the log captures it.
export async function sendAndLog(
  db: Tx,
  args: {
    lineUserId: string | null | undefined;
    text: string;
    messageType: string;
    accessToken?: string | null; // OA token; empty -> dev mock send
    orgId?: string | null;
    lineOaId?: string | null;
    customerId?: string | null;
    billPlanId?: string | null;
    billInstallmentId?: string | null;
    paymentSubmissionId?: string | null;
  }
) {
  let status: "sent" | "failed" = "failed";
  let response: unknown = null;
  let error: string | undefined = "no line_user_id";
  if (args.lineUserId) {
    const r = await pushMessage(args.lineUserId, args.text, args.accessToken ?? "");
    status = r.status;
    response = r.response ?? null;
    error = r.error;
  }
  await db.messageLog.create({
    data: {
      orgId: args.orgId ?? undefined,
      lineOaId: args.lineOaId ?? undefined,
      customerId: args.customerId ?? undefined,
      billPlanId: args.billPlanId ?? undefined,
      billInstallmentId: args.billInstallmentId ?? undefined,
      paymentSubmissionId: args.paymentSubmissionId ?? undefined,
      lineUserId: args.lineUserId ?? undefined,
      messageType: args.messageType,
      messageText: args.text,
      lineResponse: (response as Prisma.InputJsonValue) ?? undefined,
      status,
      errorMessage: error,
    },
  });
  return status;
}
