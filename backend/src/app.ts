import { Elysia } from "elysia";
import { env } from "./env";
import { logger } from "./lib/logger";
import { handleError, ok } from "./lib/response";
import { customerRoutes } from "./routes/customers";
import { bankAccountRoutes } from "./routes/bank-accounts";
import { billPlanRoutes } from "./routes/bill-plans";
import { installmentRoutes } from "./routes/installments";
import { lineRoutes } from "./routes/line";
import { jobRoutes } from "./routes/jobs";
import { adminSubmissionRoutes } from "./routes/admin-submissions";
import { authRoutes } from "./routes/auth";
import { platformRoutes } from "./routes/platform";
import { settingsRoutes } from "./routes/settings";
import { reportRoutes } from "./routes/reports";
import { logRoutes } from "./routes/logs";
import { senderRoutes } from "./routes/senders";
import { groupRoutes } from "./routes/groups";
import { lineOaRoutes } from "./routes/line-oa";
import { liffRoutes } from "./routes/liff";

export const app = new Elysia({ aot: false })
  .onError(handleError)
  .get("/health", () => ok({ status: "up", tz: env.tz }))
  .use(lineRoutes) // before others: has its own raw-body parser
  .use(authRoutes)
  .use(platformRoutes)
  .use(settingsRoutes)
  .use(reportRoutes)
  .use(logRoutes)
  .use(senderRoutes)
  .use(groupRoutes)
  .use(lineOaRoutes)
  .use(liffRoutes)
  .use(customerRoutes)
  .use(bankAccountRoutes)
  .use(billPlanRoutes)
  .use(installmentRoutes)
  .use(jobRoutes)
  .use(adminSubmissionRoutes);

// Only listen when run directly (tests import `app` without binding a port).
if (import.meta.main) {
  app.listen(env.port);
  logger.info(`listening on http://localhost:${env.port} (${env.tz})`);
  const { startScheduler } = await import("./scheduler");
  startScheduler();
}
