/** The existing /api/liff snake_case response contract. */
export type Balance = { outstanding: number; count: number; next_due_date: string | null };
export type Customer = { customer_code: string; display_name: string | null };
export type Installment = {
  id: string; installment_no: number; due_date: string;
  amount_due: number; amount_paid: number; status: string;
  bill_plan: { bill_no: number };
};
export type PaymentHistory = {
  id: string; amount: number; paid_at: string | null; payment_method: string; approved_at: string;
  bill_installment: { installment_no: number; bill_plan: { bill_no: number } };
};
export type CustomerData = {
  customer: Customer; balance: Balance; installments: Installment[]; payments: PaymentHistory[];
};
export type Tab = "unpaid" | "all" | "history";
export const TABS: { id: Tab; label: string }[] = [
  { id: "unpaid", label: "ยอดค้าง" },
  { id: "all", label: "งวดทั้งหมด" },
  { id: "history", label: "ประวัติ" },
];

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
});
export const formatAmount = (amount: number) => money.format(amount);
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : thaiDate.format(date);
}
export function remainingAmount(item: Installment): number {
  return Math.max(0, Math.round((item.amount_due - item.amount_paid) * 100) / 100);
}
export function unpaidInstallments(items: readonly Installment[]): Installment[] {
  return items.filter((item) => item.status !== "paid" && item.status !== "cancelled" && remainingAmount(item) > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.bill_plan.bill_no - b.bill_plan.bill_no || a.installment_no - b.installment_no);
}
export type Status = { label: string; tone: "pending" | "partial" | "overdue" | "paid" | "neutral"; symbol: string };
const statuses: Record<string, Status> = {
  pending: { label: "รอชำระ", tone: "pending", symbol: "○" },
  partial_paid: { label: "ชำระบางส่วน", tone: "partial", symbol: "◐" },
  overdue: { label: "เกินกำหนด", tone: "overdue", symbol: "!" },
  paid: { label: "ชำระแล้ว", tone: "paid", symbol: "✓" },
  cancelled: { label: "ยกเลิก", tone: "neutral", symbol: "−" },
};
export const installmentStatus = (status: string): Status => statuses[status] ?? { label: "ไม่ทราบสถานะ", tone: "neutral", symbol: "?" };
