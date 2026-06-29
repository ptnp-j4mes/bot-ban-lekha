import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { matchInstallment, approveSubmission, rejectSubmission } from "../services/payment";

export const adminSubmissionRoutes = new Elysia({ prefix: "/api/admin/payment-submissions" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ query, ctx }: any) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));
    const where: any = { orgId: ctx.orgId };
    if (query.match_status) where.matchStatus = query.match_status;
    if (query.review_status) where.reviewStatus = query.review_status;
    if (query.customer_id) where.customerId = query.customer_id;
    if (query.date_from || query.date_to) {
      where.createdAt = {};
      if (query.date_from) where.createdAt.gte = new Date(query.date_from);
      if (query.date_to) where.createdAt.lte = new Date(query.date_to);
    }
    const [items, total] = await Promise.all([
      prisma.paymentSubmission.findMany({
        where,
        include: { customer: true, matchedInstallment: true },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.paymentSubmission.count({ where }),
    ]);
    return ok({ items, total, page, limit });
  })

  .get("/:id", async ({ params, ctx }: any) => {
    const sub = await prisma.paymentSubmission.findFirst({
      where: { id: params.id, orgId: ctx.orgId },
      include: { customer: true, matchedInstallment: { include: { billPlan: true } } },
    });
    if (!sub) throw new ApiError("NOT_FOUND", "Submission not found");
    // 1:1 slip → candidates of that customer; group slip (no customer) → all org installments.
    const candidates = await prisma.billInstallment.findMany({
      where: {
        status: { not: "paid" },
        billPlan: sub.customerId
          ? { customerId: sub.customerId, status: "active", orgId: ctx.orgId }
          : { status: "active", orgId: ctx.orgId },
      },
      include: { billPlan: { include: { customer: true } } },
      orderBy: { dueDate: "asc" },
      take: 200,
    });
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityType: "payment_submission", entityId: sub.id },
      orderBy: { createdAt: "asc" },
    });
    return ok({ submission: sub, candidate_installments: candidates, audit_logs: auditLogs });
  })

  .patch("/:id/match-installment", async ({ params, body, ctx }: any) => {
    if (!body?.bill_installment_id) throw new ApiError("VALIDATION_ERROR", "bill_installment_id is required");
    return ok(await matchInstallment(params.id, body.bill_installment_id, body.note, ctx.userId, ctx.orgId));
  })

  .post("/bulk-approve", async ({ body, ctx }: any) => {
    const ids: string[] = body?.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0)
      throw new ApiError("VALIDATION_ERROR", "ids must be a non-empty array");
    const approved: { id: string; paymentId: string }[] = [];
    const failed: { id: string; reason: string }[] = [];
    await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await approveSubmission(id, ctx.userId, ctx.orgId);
          approved.push({ id, paymentId: r.payment.id });
        } catch (err: any) {
          failed.push({ id, reason: err.message ?? "unknown error" });
        }
      })
    );
    return ok({ approved, failed });
  })

  .post("/:id/approve", async ({ params, ctx }: any) => {
    const r = await approveSubmission(params.id, ctx.userId, ctx.orgId);
    return ok({ payment: r.payment, bill_text: r.billText });
  })

  .post("/:id/reject", async ({ params, body, ctx }: any) => {
    if (!body?.reason) throw new ApiError("VALIDATION_ERROR", "reason is required");
    return ok(await rejectSubmission(params.id, body.reason, ctx.userId, ctx.orgId));
  });
