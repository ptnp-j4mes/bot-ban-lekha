import { Elysia, t } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { bangkokToday, dateOnly } from "../lib/date";
import { renderDailyReminder, sendAndLog } from "../services/messages";
import { recordManualPayment } from "../services/payment";

export const installmentRoutes = new Elysia({ prefix: "/api/installments" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))

  .get("/due-today", async ({ ctx }: any) => {
    const today = bangkokToday();
    return ok(
      await prisma.billInstallment.findMany({
        where: { dueDate: today, status: { in: ["pending", "partial_paid"] }, billPlan: { orgId: ctx.orgId } },
        include: { billPlan: { include: { customer: true } } },
        orderBy: { dueDate: "asc" },
      })
    );
  })

  // Member-triggered: send today's reminders for THIS org (idempotent via morning_sent_at).
  .post("/send-reminders", async ({ ctx }: any) => {
    const today = bangkokToday();
    const due = await prisma.billInstallment.findMany({
      where: {
        dueDate: today, status: { in: ["pending", "partial_paid"] }, morningSentAt: null,
        billPlan: { orgId: ctx.orgId, status: "active", customer: { status: "active", lineUserId: { not: null } } },
      },
      include: { billPlan: { include: { customer: { include: { lineOa: true } } } } },
    });
    let sent = 0;
    for (const inst of due) {
      const cust = inst.billPlan.customer;
      await sendAndLog(prisma, {
        lineUserId: cust.lineUserId, text: renderDailyReminder(inst.dueDate), messageType: "daily_reminder",
        accessToken: cust.lineOa?.channelAccessToken, orgId: ctx.orgId, lineOaId: cust.lineOaId,
        customerId: cust.id, billPlanId: inst.billPlanId, billInstallmentId: inst.id,
      });
      await prisma.billInstallment.update({ where: { id: inst.id }, data: { morningSentAt: new Date() } });
      sent++;
    }
    return ok({ candidates: due.length, sent });
  })

  .get("/overdue", async ({ ctx }: any) => {
    const today = bangkokToday();
    return ok(
      await prisma.billInstallment.findMany({
        where: { dueDate: { lt: today }, status: { in: ["pending", "partial_paid", "overdue"] }, billPlan: { orgId: ctx.orgId } },
        include: { billPlan: { include: { customer: true } } },
        orderBy: { dueDate: "asc" },
      })
    );
  })

  // Send a reminder to one installment's customer now (ad-hoc, single customer).
  .post("/:id/remind", async ({ params, ctx }: any) => {
    const inst = await prisma.billInstallment.findFirst({
      where: { id: params.id, billPlan: { orgId: ctx.orgId } },
      include: { billPlan: { include: { organization: true, customer: { include: { lineOa: true } } } } },
    });
    if (!inst) throw new ApiError("NOT_FOUND", "Installment not found");
    const cust = inst.billPlan.customer;
    if (!cust?.lineUserId) throw new ApiError("VALIDATION_ERROR", "ลูกค้ายังไม่ได้ผูก LINE");
    await sendAndLog(prisma, {
      lineUserId: cust.lineUserId,
      text: inst.billPlan.organization?.reminderText?.trim() || renderDailyReminder(inst.dueDate),
      messageType: "daily_reminder",
      accessToken: cust.lineOa?.channelAccessToken,
      orgId: ctx.orgId, lineOaId: cust.lineOaId, customerId: cust.id,
      billPlanId: inst.billPlanId, billInstallmentId: inst.id,
    });
    await audit(prisma, { action: "remind_installment", entityType: "bill_installment", entityId: inst.id, orgId: ctx.orgId, actorId: ctx.userId });
    return ok({ sent: true });
  })

  // Record a manual/cash payment against this installment.
  .post("/:id/pay", async ({ params, body, ctx }: any) =>
    ok(await recordManualPayment(params.id, Number(body.amount), ctx.userId, ctx.orgId, body.method || "cash")),
    { body: t.Object({ amount: t.Number({ minimum: 0.01 }), method: t.Optional(t.String()) }) }
  )

  .patch("/:id", async ({ params, body, ctx }: any) => {
    const old = await prisma.billInstallment.findFirst({ where: { id: params.id, billPlan: { orgId: ctx.orgId } } });
    if (!old) throw new ApiError("NOT_FOUND", "Installment not found");
    const data: any = {};
    if (body?.amount_due !== undefined || body?.due_date !== undefined) {
      if (old.status === "paid") throw new ApiError("VALIDATION_ERROR", "Cannot edit amount/due_date of a paid installment");
      if (body.amount_due !== undefined) data.amountDue = body.amount_due;
      if (body.due_date !== undefined) data.dueDate = dateOnly(body.due_date);
    }
    if (body?.status !== undefined) data.status = body.status;
    if (body?.penalty_amount !== undefined) {
      if (!(body.penalty_amount >= 0)) throw new ApiError("VALIDATION_ERROR", "penalty_amount must be >= 0");
      data.penaltyAmount = body.penalty_amount;
    }
    const inst = await prisma.billInstallment.update({ where: { id: params.id }, data });
    await audit(prisma, { action: "update_installment", entityType: "bill_installment", entityId: inst.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: old, newValue: inst });
    return ok(inst);
  });
