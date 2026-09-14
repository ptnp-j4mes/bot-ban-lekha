import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { generateInstallments, MAX_INSTALLMENTS, resolveBankAccount, renderPlanBill } from "../services/bill";
import { renderGroupedBillText, sendAndLog } from "../services/messages";
import { dateOnly } from "../lib/date";
import { getSystemSettings } from "../services/systemSettings";

const include = { installments: { orderBy: { installmentNo: "asc" as const } }, bankAccount: true };
const listInclude = { ...include, customer: true };

const intervalBody = t.Object({
  customer_id: t.String({ minLength: 1 }),
  bill_no: t.Number(),
  principal_amount: t.Number(),
  installment_amount: t.Number(),
  cycle_type: t.Optional(t.String()),
  cycle_days: t.Number(),
  total_installments: t.Integer({ minimum: 1, maximum: MAX_INSTALLMENTS }),
  start_date: t.String({ minLength: 1 }),
  bank_account_id: t.Optional(t.String()),
  bill_penalty_amount: t.Optional(t.Number({ minimum: 0 })),
  installment_penalty_amount: t.Optional(t.Number({ minimum: 0 })),
  note: t.Optional(t.String()),
});
const customDatesBody = t.Object({
  customer_id: t.String({ minLength: 1 }),
  bill_no: t.Number(),
  principal_amount: t.Number(),
  cycle_type: t.Optional(t.String()),
  bank_account_id: t.Optional(t.String()),
  bill_penalty_amount: t.Optional(t.Number({ minimum: 0 })),
  note: t.Optional(t.String()),
  installments: t.Array(
    t.Object({ installment_no: t.Integer({ minimum: 1, maximum: MAX_INSTALLMENTS }), due_date: t.String({ minLength: 1 }), amount_due: t.Number(), penalty_amount: t.Optional(t.Number({ minimum: 0 })) }),
    { minItems: 1, maxItems: MAX_INSTALLMENTS }
  ),
});

export const billPlanRoutes = new Elysia({ prefix: "/api/bill-plans" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/", async ({ ctx }: any) => {
    const plans = await prisma.billPlan.findMany({ where: { orgId: ctx.orgId }, include: listInclude, orderBy: { billNo: "asc" } });
    const rank: Record<string, number> = { active: 0, completed: 1, cancelled: 2 };
    plans.sort((a, b) => (rank[a.status] ?? 99) - (rank[b.status] ?? 99) || a.billNo - b.billNo);
    return ok(plans);
  })

  .post("/", async ({ body, ctx }: any) => {
    const b = body ?? {};
    if (!b.customer_id) throw new ApiError("VALIDATION_ERROR", "customer_id is required");
    if (!b.start_date) throw new ApiError("VALIDATION_ERROR", "start_date is required");
    if (b.cycle_type === "custom_dates")
      throw new ApiError("VALIDATION_ERROR", "use POST /api/bill-plans/custom-dates for custom dates");
    if (!(b.cycle_days > 0)) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");

    const customer = await prisma.customer.findFirst({ where: { id: b.customer_id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

    const rows = generateInstallments(dateOnly(b.start_date), b.cycle_days, b.total_installments, b.installment_amount)
      .map((row) => ({ ...row, penaltyAmount: b.installment_penalty_amount ?? 0 }));

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
          penaltyAmount: b.bill_penalty_amount ?? 0,
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
    if (b.installments.length > MAX_INSTALLMENTS)
      throw new ApiError("VALIDATION_ERROR", `installments must contain at most ${MAX_INSTALLMENTS} items`);
    const customer = await prisma.customer.findFirst({ where: { id: b.customer_id, orgId: ctx.orgId } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

    const rows = b.installments.map((i: any) => {
      if (!(i.amount_due > 0)) throw new ApiError("VALIDATION_ERROR", "amount_due must be > 0");
      if (!i.due_date) throw new ApiError("VALIDATION_ERROR", "due_date is required");
      return { installmentNo: i.installment_no, dueDate: dateOnly(i.due_date), amountDue: i.amount_due, penaltyAmount: i.penalty_amount ?? 0 };
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
          penaltyAmount: b.bill_penalty_amount ?? 0,
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

  // Preview an interval bill without creating the plan or installment rows.
  .post("/preview", async ({ body, ctx }: any) => {
    const b = body ?? {};
    if (!b.customer_id) throw new ApiError("VALIDATION_ERROR", "customer_id is required");
    if (!b.start_date) throw new ApiError("VALIDATION_ERROR", "start_date is required");
    if (b.cycle_type === "custom_dates")
      throw new ApiError("VALIDATION_ERROR", "use POST /api/bill-plans/custom-dates for custom dates");
    if (!(b.cycle_days > 0)) throw new ApiError("VALIDATION_ERROR", "cycle_days must be > 0");

    const customer = await prisma.customer.findFirst({ where: { id: b.customer_id, orgId: ctx.orgId }, include: { organization: true } });
    if (!customer) throw new ApiError("NOT_FOUND", "Customer not found");

    const rows = generateInstallments(dateOnly(b.start_date), b.cycle_days, b.total_installments, b.installment_amount)
      .map((row) => ({ ...row, penaltyAmount: b.installment_penalty_amount ?? 0 }));
    const bank = await resolveBankAccount(prisma, ctx.orgId, b.bank_account_id);
    const activePlans = await prisma.billPlan.findMany({
      where: { orgId: ctx.orgId, customerId: b.customer_id, status: "active" },
      include: { installments: { orderBy: { installmentNo: "asc" } }, bankAccount: true },
      orderBy: { billNo: "asc" },
    });
    const draft = {
      principal: b.principal_amount,
      installmentAmount: b.installment_amount,
      cycleDays: b.cycle_days,
      totalInstallments: b.total_installments,
      billPenaltyAmount: b.bill_penalty_amount ?? 0,
      installments: rows.map((row) => ({ dueDate: row.dueDate, amountDue: row.amountDue, status: "pending", penaltyAmount: row.penaltyAmount })),
      bank: { accountNo: bank.accountNo, bankName: bank.bankName, accountName: bank.accountName },
      note: b.note,
    };
    const previewPlans = [
      ...activePlans.map((plan) => ({
        billNo: plan.billNo,
        plan: {
          principal: Number(plan.principalAmount),
          installmentAmount: Number(plan.installmentAmount),
          cycleDays: plan.cycleDays,
          totalInstallments: plan.totalInstallments,
          billPenaltyAmount: Number(plan.penaltyAmount),
          installments: plan.installments.map((i) => ({ dueDate: i.dueDate, amountDue: Number(i.amountDue), status: i.status, penaltyAmount: Number(i.penaltyAmount) })),
          bank: plan.bankAccount ? { accountNo: plan.bankAccount.accountNo, bankName: plan.bankAccount.bankName, accountName: plan.bankAccount.accountName } : null,
          note: plan.note,
        },
      })),
      { billNo: b.bill_no, plan: draft },
    ].sort((a, b) => a.billNo - b.billNo);
    const footer = customer.organization.billFooter || (await getSystemSettings()).defaultBillFooter;
    const text = renderGroupedBillText({
      billNo: b.bill_no,
      plans: previewPlans.map((entry) => entry.plan),
      footer,
    });
    return ok({ bill_no: b.bill_no, text });
  }, { body: intervalBody })

  // Preview uses the exact same renderer as the bill sent to LINE.
  .get("/:id/preview", async ({ params, ctx }: any) => {
    const p = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId }, select: { id: true } });
    if (!p) throw new ApiError("NOT_FOUND", "Bill plan not found");
    const bill = await renderPlanBill(prisma, p.id);
    return ok({ bill_id: bill.plan.id, bill_no: bill.plan.billNo, completed: bill.completed, text: bill.text });
  })

  .patch("/:id/penalty", async ({ params, body, ctx }: any) => {
    const plan = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId } });
    if (!plan) throw new ApiError("NOT_FOUND", "Bill plan not found");
    const updated = await prisma.billPlan.update({ where: { id: plan.id }, data: { penaltyAmount: body.bill_penalty_amount } });
    await audit(prisma, { action: "update_bill_penalty", entityType: "bill_plan", entityId: plan.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: { penaltyAmount: plan.penaltyAmount }, newValue: { penaltyAmount: updated.penaltyAmount } });
    return ok(updated);
  }, { body: t.Object({ bill_penalty_amount: t.Number({ minimum: 0 }) }) })

  .get("/:id", async ({ params, ctx }: any) => {
    const p = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId }, include });
    if (!p) throw new ApiError("NOT_FOUND", "Bill plan not found");
    return ok(p);
  })

  // Send the bill summary to the customer over LINE now (otherwise they only learn at reminder time).
  .post("/:id/send", async ({ params, ctx }: any) => {
    const p = await prisma.billPlan.findFirst({ where: { id: params.id, orgId: ctx.orgId }, include: { customer: { include: { lineOa: true } } } });
    if (!p) throw new ApiError("NOT_FOUND", "Bill plan not found");
    if (!p.customer?.lineUserId) throw new ApiError("VALIDATION_ERROR", "ลูกค้ายังไม่ได้ผูก LINE");
    const bill = await renderPlanBill(prisma, p.id);
    await sendAndLog(prisma, {
      lineUserId: p.customer.lineUserId, text: bill.text, messageType: "bill_notice",
      accessToken: p.customer.lineOa?.channelAccessToken, orgId: ctx.orgId, lineOaId: p.customer.lineOaId,
      customerId: p.customerId, billPlanId: p.id,
    });
    await audit(prisma, { action: "send_bill", entityType: "bill_plan", entityId: p.id, orgId: ctx.orgId, actorId: ctx.userId });
    return ok({ sent: true });
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
