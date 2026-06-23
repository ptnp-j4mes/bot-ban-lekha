import type { Prisma, PrismaClient } from "@prisma/client";
import { toEmojiNumber } from "../lib/emoji-number";
import { dayOfMonth, thaiMonth, beYear2 } from "../lib/date";
import { pushMessage } from "../lib/line";
import { env } from "../env";

type Tx = PrismaClient | Prisma.TransactionClient;

export const fmtAmount = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

type InstallmentView = { dueDate: Date; amountDue: number; status: string };
type BankView = { accountNo: string; bankName: string; accountName: string } | null;

// `15💸 490✅` (paid) / `29💸 490` (unpaid) — 💸 stays, ✅ appended when paid.
export function renderBillStatusLines(installments: InstallmentView[]): string {
  return installments
    .map((i) => `${dayOfMonth(i.dueDate)}💸 ${fmtAmount(i.amountDue)}${i.status === "paid" ? "✅" : ""}`)
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
  return (
    `บิล ${toEmojiNumber(args.billNo)}\n\n` +
    `${head}\n\n` +
    `${renderBillStatusLines(args.installments)}\n\n` +
    `จบ🙏` +
    bank +
    `\n\n${args.footer?.trim() || env.billFooter}`
  );
}

export const renderPaymentReceived = () =>
  `📌 ได้รับสลิปแล้วค่ะ\n\nระบบกำลังตรวจสอบยอดชำระ\nหากตรวจสอบเรียบร้อยแล้ว จะแจ้งสถานะกลับทางแชทนี้ค่ะ 🙏`;

export const renderNeedsAdminMatch = () =>
  `📌 ได้รับสลิปแล้วค่ะ\n\nระบบยังไม่สามารถจับคู่ยอดกับงวดในบิลได้อัตโนมัติ\nแอดมินจะตรวจสอบและอัปเดตสถานะให้ค่ะ 🙏`;

// Approval reply = "รับยอดค่ะ✅" header followed by the latest full bill (with ✅ on paid rows).
export const renderPaymentApproved = (billText: string) => `รับยอดค่ะ✅\n\n${billText}`;

export const renderTextHelp = () =>
  `สวัสดีค่ะ 🙏\nหากต้องการแจ้งชำระเงิน กรุณาส่ง "รูปสลิป" โอนเงินเข้ามาในแชทนี้ได้เลยค่ะ`;

export const renderDuplicateSlip = () =>
  `📌 สลิปนี้เคยส่งเข้ามาแล้วค่ะ\nระบบกำลังตรวจสอบรายการเดิมอยู่ ไม่ต้องส่งซ้ำนะคะ 🙏`;

export const renderUnsupportedSlip = () =>
  `ขออภัยค่ะ ไฟล์ที่ส่งมาไม่สามารถอ่านเป็นสลิปได้\nกรุณาส่งเป็นรูปภาพสลิป (jpg, png, webp) อีกครั้งค่ะ 🙏`;

export const renderRateLimited = () =>
  `ขออภัยค่ะ คุณส่งสลิปเข้ามาบ่อยเกินไป\nกรุณารอสักครู่แล้วลองใหม่อีกครั้งค่ะ 🙏`;

export const renderPaymentRejected = (reason: string) =>
  `ขออภัยค่ะ สลิปที่ส่งมายังไม่สามารถยืนยันยอดได้\n\nเหตุผล: ${reason}\n\nกรุณาตรวจสอบและส่งสลิปใหม่อีกครั้งค่ะ 🙏`;

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
