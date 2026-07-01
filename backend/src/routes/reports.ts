import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok } from "../lib/response";
import { authorize } from "../lib/auth";
import { bangkokToday, bangkokDateRange, toISODate } from "../lib/date";

const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csvHeaders = (filename: string) => ({ "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` });

// Column definitions decouple CSV column order/labels from the JSON row shape.
type Column = [header: string, get: (row: any) => any];
function toCsv(columns: Column[], rows: any[]): string {
  const header = columns.map(([h]) => h).join(",");
  const body = rows.map((r) => columns.map(([, get]) => esc(get(r))).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

// ---------- accounting reports (aggregate in JS over org-scoped rows; volumes here are small) ----------

// Approved payments in [from, to] (paidAt = actual transfer date), grouped by the bill plan's bank account.
async function collectionsByBank(orgId: string, from?: string, to?: string) {
  const where: any = { orgId, status: "approved" };
  const range = bangkokDateRange(from, to);
  if (range) where.paidAt = range;
  const payments = await prisma.payment.findMany({
    where,
    include: { billInstallment: { include: { billPlan: { include: { bankAccount: true } } } } },
  });
  const agg = new Map<string, { bank_account_id: string | null; bank_name: string; account_no: string; account_name: string; count: number; amount: number }>();
  for (const p of payments) {
    const bank = p.billInstallment.billPlan.bankAccount;
    const key = bank?.id ?? "unassigned";
    if (!agg.has(key)) {
      agg.set(key, { bank_account_id: bank?.id ?? null, bank_name: bank?.bankName ?? "ไม่ระบุบัญชี", account_no: bank?.accountNo ?? "", account_name: bank?.accountName ?? "", count: 0, amount: 0 });
    }
    const a = agg.get(key)!;
    a.count++;
    a.amount += Number(p.amount);
  }
  const rows = [...agg.values()].sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0), count: payments.length };
}
const BANK_COLUMNS: Column[] = [
  ["bank_account_id", (r) => r.bank_account_id], ["bank_name", (r) => r.bank_name], ["account_no", (r) => r.account_no],
  ["account_name", (r) => r.account_name], ["count", (r) => r.count], ["amount", (r) => r.amount],
];

// Approved payments in [from, to], grouped by the LINE group + sender that submitted the slip.
async function collectionsBySender(orgId: string, from?: string, to?: string) {
  const where: any = { orgId, status: "approved" };
  const range = bangkokDateRange(from, to);
  if (range) where.paidAt = range;
  const [payments, groups] = await Promise.all([
    prisma.payment.findMany({ where, include: { paymentSubmission: true } }),
    prisma.lineGroup.findMany({ where: { orgId } }),
  ]);
  const groupNameMap = new Map(groups.map((g) => [g.lineGroupId, g.name]));
  const agg = new Map<string, { line_group_id: string | null; group_name: string | null; line_user_id: string | null; sender_name: string; count: number; amount: number }>();
  for (const p of payments) {
    const sub = p.paymentSubmission;
    const groupId = sub?.lineGroupId ?? null;
    const senderName = sub ? sub.senderName ?? "ไม่ระบุผู้ส่ง" : "บันทึกมือ (ไม่มีสลิป)";
    const key = `${groupId ?? "-"}|${sub?.lineUserId ?? senderName}`;
    if (!agg.has(key)) {
      agg.set(key, { line_group_id: groupId, group_name: groupId ? groupNameMap.get(groupId) ?? groupId : null, line_user_id: sub?.lineUserId ?? null, sender_name: senderName, count: 0, amount: 0 });
    }
    const a = agg.get(key)!;
    a.count++;
    a.amount += Number(p.amount);
  }
  const rows = [...agg.values()].sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0), count: payments.length };
}
const SENDER_COLUMNS: Column[] = [
  ["line_group_id", (r) => r.line_group_id], ["group_name", (r) => r.group_name], ["line_user_id", (r) => r.line_user_id],
  ["sender_name", (r) => r.sender_name], ["count", (r) => r.count], ["amount", (r) => r.amount],
];

// Outstanding (unpaid/partial) installments past due, bucketed by days overdue: 1-7, 8-30, 31+.
async function agingReport(orgId: string) {
  const today = bangkokToday();
  const installments = await prisma.billInstallment.findMany({
    where: { billPlan: { orgId }, status: { in: ["pending", "partial_paid", "overdue"] }, dueDate: { lt: today } },
    include: { billPlan: { include: { customer: true } } },
  });
  const bucketFor = (days: number) => (days <= 7 ? "1-7" : days <= 30 ? "8-30" : "31+");
  const buckets: Record<string, { count: number; amount: number }> = { "1-7": { count: 0, amount: 0 }, "8-30": { count: 0, amount: 0 }, "31+": { count: 0, amount: 0 } };
  const rows = installments
    .map((i) => {
      const days = Math.round((today.getTime() - i.dueDate.getTime()) / 86400000);
      const bucket = bucketFor(days);
      const outstanding = Number(i.amountDue) - Number(i.amountPaid);
      buckets[bucket].count++;
      buckets[bucket].amount += outstanding;
      return {
        customer_id: i.billPlan.customerId, customer_code: i.billPlan.customer.customerCode, customer_name: i.billPlan.customer.displayName,
        bill_no: i.billPlan.billNo, installment_no: i.installmentNo, due_date: toISODate(i.dueDate), days_overdue: days, bucket,
        amount_due: Number(i.amountDue), amount_paid: Number(i.amountPaid), outstanding,
      };
    })
    .sort((a, b) => b.days_overdue - a.days_overdue);
  return { buckets, rows, total_outstanding: rows.reduce((s, r) => s + r.outstanding, 0) };
}
const AGING_COLUMNS: Column[] = [
  ["customer_code", (r) => r.customer_code], ["customer_name", (r) => r.customer_name], ["bill_no", (r) => r.bill_no],
  ["installment_no", (r) => r.installment_no], ["due_date", (r) => r.due_date], ["days_overdue", (r) => r.days_overdue],
  ["bucket", (r) => r.bucket], ["amount_due", (r) => r.amount_due], ["amount_paid", (r) => r.amount_paid], ["outstanding", (r) => r.outstanding],
];

// Approved payments in [from, to] (approvedAt), with who approved them — for reconciling against bank statements.
async function approvalsReport(orgId: string, from?: string, to?: string) {
  const where: any = { orgId, status: "approved" };
  const range = bangkokDateRange(from, to);
  if (range) where.approvedAt = range;
  const payments = await prisma.payment.findMany({
    where,
    include: { customer: true, billInstallment: { include: { billPlan: { include: { bankAccount: true } } } }, paymentSubmission: true },
    orderBy: { approvedAt: "desc" },
  });
  const rows = payments.map((p) => ({
    payment_id: p.id, approved_at: p.approvedAt.toISOString(), approved_by: p.approvedBy,
    customer_code: p.customer.customerCode, customer_name: p.customer.displayName,
    bill_no: p.billInstallment.billPlan.billNo, installment_no: p.billInstallment.installmentNo,
    amount: Number(p.amount), payment_method: p.paymentMethod,
    bank_name: p.billInstallment.billPlan.bankAccount?.bankName ?? null,
    line_group_id: p.paymentSubmission?.lineGroupId ?? null, sender_name: p.paymentSubmission?.senderName ?? null,
  }));
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length };
}
const APPROVAL_COLUMNS: Column[] = [
  ["payment_id", (r) => r.payment_id], ["approved_at", (r) => r.approved_at], ["approved_by", (r) => r.approved_by],
  ["customer_code", (r) => r.customer_code], ["customer_name", (r) => r.customer_name], ["bill_no", (r) => r.bill_no],
  ["installment_no", (r) => r.installment_no], ["amount", (r) => r.amount], ["payment_method", (r) => r.payment_method],
  ["bank_name", (r) => r.bank_name], ["line_group_id", (r) => r.line_group_id], ["sender_name", (r) => r.sender_name],
];

// Slips received in [from, to] that still aren't tied to a bill (unmatched / needs admin match).
// Amounts here are OCR-parsed and NOT yet approved — never roll these into "collected" totals.
async function unmatchedReport(orgId: string, from?: string, to?: string) {
  const where: any = { orgId, matchStatus: { in: ["unmatched", "needs_admin_match"] } };
  const range = bangkokDateRange(from, to);
  if (range) where.createdAt = range;
  const subs = await prisma.paymentSubmission.findMany({ where, include: { customer: true }, orderBy: { createdAt: "desc" } });
  const rows = subs.map((s) => ({
    submission_id: s.id, created_at: s.createdAt.toISOString(), review_status: s.reviewStatus, match_status: s.matchStatus,
    customer_code: s.customer?.customerCode ?? null, line_group_id: s.lineGroupId, sender_name: s.senderName,
    parsed_amount: s.parsedAmount ? Number(s.parsedAmount) : null,
    parsed_transfer_date: s.parsedTransferDate ? toISODate(s.parsedTransferDate) : null,
    parsed_reference_no: s.parsedReferenceNo, parsed_bank_name: s.parsedBankName,
  }));
  return { rows, count: rows.length, total_parsed_amount: rows.reduce((s, r) => s + (r.parsed_amount ?? 0), 0) };
}
const UNMATCHED_COLUMNS: Column[] = [
  ["submission_id", (r) => r.submission_id], ["created_at", (r) => r.created_at], ["review_status", (r) => r.review_status],
  ["match_status", (r) => r.match_status], ["customer_code", (r) => r.customer_code], ["line_group_id", (r) => r.line_group_id],
  ["sender_name", (r) => r.sender_name], ["parsed_amount", (r) => r.parsed_amount], ["parsed_transfer_date", (r) => r.parsed_transfer_date],
  ["parsed_reference_no", (r) => r.parsed_reference_no], ["parsed_bank_name", (r) => r.parsed_bank_name],
];

// Org-scoped reporting. Any member can view/export.
export const reportRoutes = new Elysia({ prefix: "/api/reports" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/summary", async ({ query, ctx }: any) => {
    const range: any = {};
    if (query.from) range.gte = new Date(query.from);
    if (query.to) range.lte = new Date(`${query.to}T23:59:59`);
    const paymentWhere: any = { orgId: ctx.orgId, status: "approved" };
    if (query.from || query.to) paymentWhere.createdAt = range;
    const today = bangkokToday();

    const [collected, paymentCount, pendingCount, overdue, customers] = await Promise.all([
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.paymentSubmission.count({ where: { orgId: ctx.orgId, reviewStatus: "pending_review" } }),
      prisma.billInstallment.findMany({
        where: { dueDate: { lt: today }, status: { in: ["pending", "partial_paid", "overdue"] }, billPlan: { orgId: ctx.orgId } },
        select: { amountDue: true, amountPaid: true },
      }),
      prisma.customer.count({ where: { orgId: ctx.orgId } }),
    ]);
    const overdueAmount = overdue.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0);
    return ok({
      collected: Number(collected._sum.amount ?? 0),
      payment_count: paymentCount,
      pending_count: pendingCount,
      overdue_count: overdue.length,
      overdue_amount: overdueAmount,
      customers,
    });
  })

  // Daily bot report: slips per LINE group on a date + a combined total.
  .get("/daily", async ({ query, ctx }: any) => {
    const date = query.date || toISODate(bangkokToday());
    const start = new Date(`${date}T00:00:00+07:00`);
    const end = new Date(start.getTime() + 86400000);
    const subs = await prisma.paymentSubmission.findMany({
      where: { orgId: ctx.orgId, lineGroupId: { not: null }, createdAt: { gte: start, lt: end } },
      include: { payment: true },
    });
    const groups = await prisma.lineGroup.findMany({ where: { orgId: ctx.orgId } });
    const nameMap = new Map(groups.map((g) => [g.lineGroupId, g.name]));
    const blank = () => ({ received: 0, approved: 0, pending: 0, rejected: 0, needs_admin: 0, amount: 0 });
    const agg = new Map<string, ReturnType<typeof blank>>();
    for (const s of subs) {
      const k = s.lineGroupId!;
      if (!agg.has(k)) agg.set(k, blank());
      const a = agg.get(k)!;
      a.received++;
      if (s.reviewStatus === "approved") { a.approved++; a.amount += Number(s.payment?.amount ?? 0); }
      else if (s.reviewStatus === "rejected") a.rejected++;
      else a.pending++;
      if (s.matchStatus === "needs_admin_match") a.needs_admin++;
    }
    const rows = [...agg.entries()].map(([gid, a]) => ({ line_group_id: gid, name: nameMap.get(gid) ?? gid, ...a })).sort((x, y) => y.received - x.received);
    const combined = rows.reduce((s, g) => ({
      received: s.received + g.received, approved: s.approved + g.approved, pending: s.pending + g.pending,
      rejected: s.rejected + g.rejected, needs_admin: s.needs_admin + g.needs_admin, amount: s.amount + g.amount,
    }), blank());
    return ok({ date, groups: rows, combined });
  })

  .get("/payments.csv", async ({ query, ctx }: any) => {
    const where: any = { orgId: ctx.orgId, status: "approved" };
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(`${query.to}T23:59:59`);
    }
    const rows = await prisma.payment.findMany({ where, include: { customer: true, billInstallment: true }, orderBy: { createdAt: "desc" } });
    const header = "paid_at,customer_code,customer_name,amount,installment_due,approved_at";
    const body = rows
      .map((p) =>
        [p.paidAt?.toISOString().slice(0, 10), p.customer?.customerCode, p.customer?.displayName, Number(p.amount), p.billInstallment?.dueDate.toISOString().slice(0, 10), p.approvedAt.toISOString()]
          .map(esc)
          .join(",")
      )
      .join("\n");
    return new Response(`${header}\n${body}\n`, { headers: csvHeaders("payments.csv") });
  })

  // ---------- accounting / reconciliation reports (P2 #16) ----------

  .get("/collections/bank", async ({ query, ctx }: any) => ok(await collectionsByBank(ctx.orgId, query.from, query.to)))
  .get("/collections/bank.csv", async ({ query, ctx }: any) => {
    const { rows } = await collectionsByBank(ctx.orgId, query.from, query.to);
    return new Response(toCsv(BANK_COLUMNS, rows), { headers: csvHeaders("collections-by-bank.csv") });
  })

  .get("/collections/senders", async ({ query, ctx }: any) => ok(await collectionsBySender(ctx.orgId, query.from, query.to)))
  .get("/collections/senders.csv", async ({ query, ctx }: any) => {
    const { rows } = await collectionsBySender(ctx.orgId, query.from, query.to);
    return new Response(toCsv(SENDER_COLUMNS, rows), { headers: csvHeaders("collections-by-sender.csv") });
  })

  .get("/aging", async ({ ctx }: any) => ok(await agingReport(ctx.orgId)))
  .get("/aging.csv", async ({ ctx }: any) => {
    const { rows } = await agingReport(ctx.orgId);
    return new Response(toCsv(AGING_COLUMNS, rows), { headers: csvHeaders("aging.csv") });
  })

  .get("/approvals", async ({ query, ctx }: any) => ok(await approvalsReport(ctx.orgId, query.from, query.to)))
  .get("/approvals.csv", async ({ query, ctx }: any) => {
    const { rows } = await approvalsReport(ctx.orgId, query.from, query.to);
    return new Response(toCsv(APPROVAL_COLUMNS, rows), { headers: csvHeaders("approvals.csv") });
  })

  .get("/unmatched", async ({ query, ctx }: any) => ok(await unmatchedReport(ctx.orgId, query.from, query.to)))
  .get("/unmatched.csv", async ({ query, ctx }: any) => {
    const { rows } = await unmatchedReport(ctx.orgId, query.from, query.to);
    return new Response(toCsv(UNMATCHED_COLUMNS, rows), { headers: csvHeaders("unmatched.csv") });
  });
