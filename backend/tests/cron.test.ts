import { expect, test } from "bun:test";

test("server cron helper calls the daily reminder job with the job key", async () => {
  const file = Bun.file(new URL("../../scripts/send-daily-bill-reminders.sh", import.meta.url));
  const exists = await file.exists();
  expect(exists).toBe(true);
  if (!exists) return;
  const source = await file.text();
  expect(source).toContain("/api/jobs/send-daily-bill-reminders");
  expect(source).toContain('"x-job-key: ${INTERNAL_JOB_API_KEY}"');
});

test("backend entrypoint does not start an in-process scheduler", async () => {
  const source = await Bun.file(new URL("../src/app.ts", import.meta.url)).text();
  expect(source).not.toContain("./scheduler");
  expect(source).not.toContain("startScheduler()");
});
