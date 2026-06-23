import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok } from "../lib/response";
import { authorize } from "../lib/auth";
import { bangkokToday, toISODate } from "../lib/date";

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
