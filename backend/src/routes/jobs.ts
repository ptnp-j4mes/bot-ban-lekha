import { Elysia } from "elysia";
import { prisma } from "../lib/prisma";
import { ok } from "../lib/response";
import { requireJob } from "../lib/auth";
import { bangkokToday } from "../lib/date";
import { renderDailyReminder, sendAndLog } from "../services/messages";
import { pushMessage } from "../lib/line";
import { captureError } from "../lib/logger";
import { purgeExpiredSlips } from "../services/retention";

// Send a reminder for each due installment, guarded by a "sent_at" column for idempotency.
// When `hourField` is given, only orgs whose configured hour matches the current Bangkok hour fire
// (used by the scheduler); without it, all due reminders are sent (used by the manual job endpoint).
export async function runReminder(
  field: "morningSentAt" | "beforeDeadlineSentAt",
  messageType: string,
  match?: { hour: number; hourField: "reminderHour" | "deadlineHour" }
) {
  const today = bangkokToday();
  const due = await prisma.billInstallment.findMany({
    where: {
      dueDate: today,
      status: { in: ["pending", "partial_paid"] },
      [field]: null,
      billPlan: {
        status: "active",
        customer: { status: "active", lineUserId: { not: null } },
        ...(match ? { organization: { [match.hourField]: match.hour } } : {}),
      },
    },
    include: { billPlan: { include: { organization: true, customer: { include: { lineOa: true } } } } },
  });
  let sent = 0;
  for (const inst of due) {
    try {
      const cust = inst.billPlan.customer;
      await sendAndLog(prisma, {
        lineUserId: cust.lineUserId,
        text: inst.billPlan.organization?.reminderText?.trim() || renderDailyReminder(inst.dueDate),
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

export async function markOverdue() {
  const today = bangkokToday();
  const r = await prisma.billInstallment.updateMany({
    where: { dueDate: { lt: today }, status: { in: ["pending", "partial_paid"] } },
    data: { status: "overdue" },
  });
  return { marked: r.count };
}

export async function retryFailed() {
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
  return { candidates: failed.length, retried };
}

export const jobRoutes = new Elysia({ prefix: "/api/jobs" })
  .onBeforeHandle(({ headers }) => requireJob(headers))
  .post("/send-daily-bill-reminders", async () => ok(await runReminder("morningSentAt", "daily_reminder")))
  .post("/send-before-deadline-reminders", async () => ok(await runReminder("beforeDeadlineSentAt", "before_deadline_reminder")))
  .post("/mark-overdue", async () => ok(await markOverdue()))
  .post("/retry-failed-line-messages", async () => ok(await retryFailed()))
  .post("/purge-expired-slips", async () => ok(await purgeExpiredSlips()));
