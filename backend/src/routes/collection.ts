import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { addCollectionActivity, FOLLOW_UP_STATUSES } from "../services/collection";

const activityBody = t.Object({
  status: t.Optional(t.String()),
  note: t.Optional(t.String()),
  promise_to_pay_date: t.Optional(t.String()),
  next_follow_up_date: t.Optional(t.String()),
  assigned_to_id: t.Optional(t.String()),
});

// Internal debtor follow-up workflow: status/notes/promise-to-pay/snooze/assignment, plus an
// activity timeline. Independent of Payment/BillInstallment status; never sends LINE messages.
export const collectionRoutes = new Elysia({ prefix: "/api" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  // Current follow-up state + full activity timeline for one customer.
  .get("/customers/:id/collection-activities", async ({ params, ctx }: any) => {
    const customer = await prisma.customer.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");
    const [followUp, activities] = await Promise.all([
      prisma.customerFollowUp.findFirst({ where: { customerId: customer.id, orgId: ctx.orgId } }),
      prisma.collectionActivity.findMany({ where: { customerId: customer.id, orgId: ctx.orgId }, orderBy: { createdAt: "desc" } }),
    ]);
    return ok({ follow_up: followUp, activities });
  })

  // Add a follow-up note / status change / promise-to-pay date / snooze / assignment.
  .post(
    "/customers/:id/collection-activities",
    async ({ params, body, ctx }: any) => {
      const { status, note, promise_to_pay_date, next_follow_up_date, assigned_to_id } = body ?? {};
      const { activity, followUp } = await addCollectionActivity(ctx.orgId, params.id, ctx.userId, {
        status,
        note,
        promiseToPayDate: promise_to_pay_date,
        nextFollowUpDate: next_follow_up_date,
        assignedToId: assigned_to_id,
      });
      return ok({ activity, follow_up: followUp });
    },
    { body: activityBody }
  )

  // Org-wide follow-up queue: current state per customer, optionally filtered by status — feeds
  // the collection/overdue dashboard filter.
  .get("/collection/follow-ups", async ({ query, ctx }: any) => {
    const where: any = { orgId: ctx.orgId };
    if (query.status) where.status = query.status;
    const followUps = await prisma.customerFollowUp.findMany({
      where,
      include: { customer: true },
      orderBy: { updatedAt: "desc" },
    });
    return ok(followUps);
  })

  .get("/collection/statuses", () => ok(FOLLOW_UP_STATUSES));
