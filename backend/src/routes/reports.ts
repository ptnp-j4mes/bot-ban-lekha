import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { bangkokDayEndExclusive, bangkokDayStart, bangkokToday, dateOnly, toISODate } from "../lib/date";

// Org-scoped reporting. Any member can view/export.
export const reportRoutes = new Elysia({ prefix: "/api/reports" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/summary", async ({ query, ctx }: any) => {
    const range: any = {};
    if (query.from) range.gte = bangkokDayStart(query.from);
    if (query.to) range.lt = bangkokDayEndExclusive(query.to);
    const paymentWhere: any = { orgId: ctx.orgId, status: "approved" };
    if (query.from || query.to) paymentWhere.createdAt = range;
    const today = bangkokToday();

    const [collected, paymentCount, pendingCount, overdue, customers, uncollected] = await Promise.all([
      prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.paymentSubmission.count({ where: { orgId: ctx.orgId, reviewStatus: "pending_review" } }),
      prisma.billInstallment.findMany({
        where: { dueDate: { lt: today }, status: { in: ["pending", "partial_paid", "overdue"] }, billPlan: { orgId: ctx.orgId } },
        select: { amountDue: true, amountPaid: true },
      }),
      prisma.customer.count({ where: { orgId: ctx.orgId } }),
      prisma.billInstallment.findMany({
        where: {
          status: { in: ["pending", "partial_paid", "overdue"] },
          billPlan: { orgId: ctx.orgId, status: { not: "cancelled" } },
        },
        select: { amountDue: true, amountPaid: true },
      }),
    ]);
    const overdueAmount = overdue.reduce((s, i) => s + (Number(i.amountDue) - Number(i.amountPaid)), 0);
    const uncollectedAmount = uncollected.reduce((s, i) => s + Math.max(0, Number(i.amountDue) - Number(i.amountPaid)), 0);
    return ok({
      collected: Number(collected._sum.amount ?? 0),
      payment_count: paymentCount,
      pending_count: pendingCount,
      overdue_count: overdue.length,
      overdue_amount: overdueAmount,
      customers,
      total_bill_amount: uncollectedAmount,
    });
  })

  .get("/dashboard-charts", async ({ query, ctx }: any) => {
    const todayIso = toISODate(bangkokToday());
    const [todayYear, todayMonth] = todayIso.split("-").map(Number);
    const period = query.period === "month" ? "month" : "year";
    const year = Number(query.year ?? todayYear);
    const month = Number(query.month ?? todayMonth);
    if (!Number.isInteger(year) || year < 2000 || year > 2100)
      throw new ApiError("VALIDATION_ERROR", "year must be between 2000 and 2100");
    if (period === "month" && (!Number.isInteger(month) || month < 1 || month > 12))
      throw new ApiError("VALIDATION_ERROR", "month must be between 1 and 12");

    const rows = await prisma.billInstallment.findMany({
      where: {
        dueDate: { gte: dateOnly(`${year}-01-01`), lt: dateOnly(`${year + 1}-01-01`) },
        status: { not: "cancelled" },
        billPlan: { orgId: ctx.orgId, status: { not: "cancelled" } },
      },
      select: { dueDate: true, amountDue: true, amountPaid: true },
    });
    const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, total: 0, collected: 0, uncollected: 0 }));
    for (const row of rows) {
      const point = monthly[row.dueDate.getUTCMonth()];
      const total = Number(row.amountDue);
      const collected = Math.min(total, Math.max(0, Number(row.amountPaid)));
      point.total += total;
      point.collected += collected;
      point.uncollected += Math.max(0, total - collected);
    }
    const selected = period === "month"
      ? monthly[month - 1]
      : monthly.reduce((sum, point) => ({
        month: 0,
        total: sum.total + point.total,
        collected: sum.collected + point.collected,
        uncollected: sum.uncollected + point.uncollected,
      }), { month: 0, total: 0, collected: 0, uncollected: 0 });

    return ok({ period, year, month: period === "month" ? month : null, pie: selected, monthly });
  })

  // Daily bot report: slips per LINE group on a date + a combined total.
  .get("/daily", async ({ query, ctx }: any) => {
    const date = query.date || toISODate(bangkokToday());
    const start = bangkokDayStart(date);
    const end = bangkokDayEndExclusive(date);
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
      if (query.from) where.createdAt.gte = bangkokDayStart(query.from);
      if (query.to) where.createdAt.lt = bangkokDayEndExclusive(query.to);
    }
    const rows = await prisma.payment.findMany({ where, include: { customer: true, billInstallment: true }, orderBy: { createdAt: "desc" } });
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "paid_at,customer_code,customer_name,amount,installment_due,approved_at";
    const body = rows
      .map((p) =>
        [p.paidAt?.toISOString().slice(0, 10), p.customer?.customerCode, p.customer?.displayName, Number(p.amount), p.billInstallment?.dueDate.toISOString().slice(0, 10), p.approvedAt.toISOString()]
          .map(esc)
          .join(",")
      )
      .join("\n");
    return new Response(`${header}\n${body}\n`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="payments.csv"' },
    });
  });
