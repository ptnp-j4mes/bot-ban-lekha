import pino from "pino";

// Structured JSON logger with redaction so secrets never reach logs.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "authorization",
      "password",
      "passwordHash",
      "channelSecret",
      "channelAccessToken",
      "*.authorization",
      "*.password",
      "*.passwordHash",
      "*.channelSecret",
      "*.channelAccessToken",
      "headers.authorization",
      'headers["x-api-key"]',
    ],
    censor: "[REDACTED]",
  },
});

// Single seam for error reporting — plug Sentry/Datadog here later (gated on SENTRY_DSN).
export function captureError(err: unknown, context: Record<string, unknown> = {}) {
  logger.error({ err, ...context }, "error");
}
