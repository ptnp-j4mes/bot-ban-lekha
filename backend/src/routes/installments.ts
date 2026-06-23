import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok, ApiError } from "../lib/response";
import { authorize } from "../lib/auth";
import { audit } from "../services/audit";
import { bangkokToday, dateOnly } from "../lib/date";
import { renderDailyReminder, sendAndLog } from "../services/messages";

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
    const inst = await prisma.billInstallment.update({ where: { id: params.id }, data });
    await audit(prisma, { action: "update_installment", entityType: "bill_installment", entityId: inst.id, orgId: ctx.orgId, actorId: ctx.userId, oldValue: old, newValue: inst });
    return ok(inst);
  });
