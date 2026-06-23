import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok } from "../lib/response";
import { requireJob } from "../lib/auth";
import { bangkokToday } from "../lib/date";
import { renderDailyReminder, sendAndLog } from "../services/messages";
import { pushMessage } from "../lib/line";
import { captureError } from "../lib/logger";

// Send a reminder for each due installment, guarded by a "sent_at" column for idempotency.
async function runReminder(field: "morningSentAt" | "beforeDeadlineSentAt", messageType: string) {
  const today = bangkokToday();
  const due = await prisma.billInstallment.findMany({
    where: {
      dueDate: today,
      status: { in: ["pending", "partial_paid"] },
      [field]: null,
      billPlan: { status: "active", customer: { status: "active", lineUserId: { not: null } } },
    },
    include: { billPlan: { include: { customer: { include: { lineOa: true } } } } },
  });
  let sent = 0;
  for (const inst of due) {
    try {
      const cust = inst.billPlan.customer;
      await sendAndLog(prisma, {
        lineUserId: cust.lineUserId,
        text: renderDailyReminder(inst.dueDate),
        messageType,
        accessToken: cust.lineOa?.channelAccessToken,
        orgId: cust.orgId,
        lineOaId: cust.lineOaId,
        customerId: cust.id,
        billPlanId: inst.billPlanId,
        billInstallmentId: inst.id,
      });
      await prisma.billInstallment.update({ where: { id: inst.id }, data: { [field]: new Date() } });
      sent++;
    } catch (e) {
      captureError(e, { scope: "reminder", installmentId: inst.id });
    }
  }
  return { candidates: due.length, sent };
}

export const jobRoutes = new Elysia({ prefix: "/api/jobs" })
  .onBeforeHandle(({ headers }) => requireJob(headers))

  .post("/send-daily-bill-reminders", async () => ok(await runReminder("morningSentAt", "daily_reminder")))

  .post("/send-before-deadline-reminders", async () =>
    ok(await runReminder("beforeDeadlineSentAt", "before_deadline_reminder"))
  )

  .post("/mark-overdue", async () => {
    const today = bangkokToday();
    const r = await prisma.billInstallment.updateMany({
      where: { dueDate: { lt: today }, status: { in: ["pending", "partial_paid"] } },
      data: { status: "overdue" },
    });
    return ok({ marked: r.count });
  })

  .post("/retry-failed-line-messages", async () => {
    const failed = await prisma.messageLog.findMany({
      where: { status: "failed", lineUserId: { not: null } },
      include: { lineOa: true },
      take: 100,
    });
    let retried = 0;
    for (const log of failed) {
      const r = await pushMessage(log.lineUserId!, log.messageText ?? "", log.lineOa?.channelAccessToken ?? "");
      if (r.status === "sent") {
        await prisma.messageLog.update({ where: { id: log.id }, data: { status: "sent", errorMessage: null } });
        retried++;
      }
    }
    return ok({ candidates: failed.length, retried });
  });
