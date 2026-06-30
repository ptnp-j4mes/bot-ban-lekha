import { runReminder, markOverdue, retryFailed } from "./routes/jobs";
import { purgeExpiredSlips } from "./services/retention";
import { logger } from "./lib/logger";

// In-process scheduler. Reminder sends are idempotent (guarded by *_sent_at columns),
// mark-overdue and retry are idempotent too — so over-running a tick is harmless.
// Each org picks its own reminder/deadline hour; only matching orgs fire this tick.
// ponytail: naive hour-match on a 15-min interval; swap for croner + a leader lock if you
// run multiple instances and need exact-minute firing.
const bangkokHour = () =>
  Number(new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour12: false }).slice(0, 2));

async function tick() {
  try {
    const h = bangkokHour();
    await markOverdue();
    await runReminder("morningSentAt", "daily_reminder", { hour: h, hourField: "reminderHour" });
    await runReminder("beforeDeadlineSentAt", "before_deadline_reminder", { hour: h, hourField: "deadlineHour" });
    await retryFailed();
    await purgeExpiredSlips();
  } catch (e) {
    logger.error({ err: e }, "scheduler tick failed");
  }
}

export function startScheduler() {
  tick(); // boot tick: mark overdue + retry immediately
  setInterval(tick, 15 * 60_000);
  logger.info("scheduler started (15-min tick; per-org reminder/deadline hours, Asia/Bangkok)");
}
