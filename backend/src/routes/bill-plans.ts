import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { generateInstallments, resolveBankAccount } from "../services/bill";
import { dateOnly } from "../lib/date";

const include = { installments: { orderBy: { installmentNo: "asc" as const } }, bankAccount: true };

const intervalBody = t.Object({
  customer_id: t.String({ minLength: 1 }),
  bill_no: t.Number(),
  principal_amount: t.Number(),
  installment_amount: t.Number(),
  cycle_type: t.Optional(t.String()),
  cycle_days: t.Number(),
  total_installments: t.Number(),
  start_date: t.String({ minLength: 1 }),
  bank_account_id: t.Optional(t.String()),
  note: t.Optional(t.String()),
});
const customDatesBody = t.Object({
  customer_id: t.String({ minLength: 1 }),
  bill_no: t.Number(),
  principal_amount: t.Number(),
  cycle_type: t.Optional(t.String()),
  bank_account_id: t.Optional(t.String()),
  note: t.Optional(t.String()),
  installments: t.Array(
    t.Object({ installment_no: t.Number(), due_date: t.String({ minLength: 1 }), amount_due: t.Number() }),
    { minItems: 1 }
  ),
});

export const billPlanRoutes = new Elysia({ prefix: "/api/bill-plans" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .post("/", async ({ body, ctx }: any) => {
    const b = body ?? {};
    if (!b.customer_id) throw new ApiError("VALIDATION_ERROR", "customer_id is required");
    if (!b.start_date) throw new ApiError("VALIDATION_ERROR", "start_date is required");
    if (b.cycle_type === "custom_dates")
      throw new ApiError("VALIDATION_ERROR", "use POST /api/bill-plans/custom-dates for custom dates");
    if (!(b.cycle_days > 0)) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");

    const customer = await prisma.customer.findFirst({ where: { id: b.customer_id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

    const rows = generateInstallments(dateOnly(b.start_date), b.cycle_days, b.total_installments, b.installment_amount);

    const plan = await prisma.$transaction(async (tx) => {
      const bank = await resolveBankAccount(tx, ctx.orgId, b.bank_account_id);
      const p = await tx.billPlan.create({
        data: {
          orgId: ctx.orgId,
          customerId: b.customer_id,
          bankAccountId: bank.id,
          billNo: b.bill_no,
          principalAmount: b.principal_amount,
          installmentAmount: b.installment_amount,
          cycleType: "interval_days",
          cycleDays: b.cycle_days,
          totalInstallments: b.total_installments,
          startDate: dateOnly(b.start_date),
          note: b.note,
          installments: { create: rows.map((r) => ({ ...r })) },
        },
        include,
      });
      await audit(tx, { action: "create_bill_plan", entityType: "bill_plan", entityId: p.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: { billNo: p.billNo } });
      return p;
    });
    return ok(plan);
  }, { body: intervalBody })

  .post("/custom-dates", async ({ body, ctx }: any) => {
    const b = body ?? {};
    if (!b.customer_id) throw new ApiError("VALIDATION_ERROR", "customer_id is required");
    if (!Array.isArray(b.installments) || b.installments.length === 0)
      throw new ApiError("VALIDATION_ERROR", "installments is required");
    const customer = await prisma.customer.findFirst({ where: { id: b.customer_id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

    const rows = b.installments.map((i: any) => {
      if (!(i.amount_due > 0)) throw new ApiError("VALIDATION_ERROR", "amount_due must be > 0");
      if (!i.due_date) throw new ApiError("VALIDATION_ERROR", "due_date is required");
      return { installmentNo: i.installment_no, dueDate: dateOnly(i.due_date), amountDue: i.amount_due };
    });

    const plan = await prisma.$transaction(async (tx) => {
      const bank = await resolveBankAccount(tx, ctx.orgId, b.bank_account_id);
      const p = await tx.billPlan.create({
        data: {
          orgId: ctx.orgId,
          customerId: b.customer_id,
          bankAccountId: bank.id,
          billNo: b.bill_no,
          principalAmount: b.principal_amount,
          installmentAmount: 0,
          cycleType: "custom_dates",
          cycleDays: null,
          totalInstallments: rows.length,
          startDate: rows[0].dueDate,
          note: b.note,
          installments: { create: rows },
        },
        include,
      });
      await audit(tx, { action: "create_bill_plan", entityType: "bill_plan", entityId: p.id, orgId: ctx.orgId, actorId: ctx.userId, newValue: { billNo: p.billNo } });
      return p;
    });
    return ok(plan);
  }, { body: customDatesBody })

  .get("/:id", async ({ params, ctx }: any) => {
    const p = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId }, include });
    if (!p) throw new ApiError("NOT_FOUND", "Bill plan not found");
    return ok(p);
  })

  .patch("/:id/cancel", async ({ params, ctx }: any) => {
    const p = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!p) throw new ApiError("NOT_FOUND", "Bill plan not found");
    const updated = await prisma.$transaction(async (tx) => {
      await tx.billInstallment.updateMany({ where: { billPlanId: p.id, status: { notIn: ["paid"] } }, data: { status: "cancelled" } });
      const np = await tx.billPlan.update({ where: { id: p.id }, data: { status: "cancelled" }, include });
      await audit(tx, { action: "cancel_bill_plan", entityType: "bill_plan", entityId: p.id, orgId: ctx.orgId, actorId: ctx.userId });
      return np;
    });
    return ok(updated);
  });
