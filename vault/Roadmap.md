# Roadmap

Up: [[Home]]

## Done

- Core billing (customers, banks, bill plans interval + custom-dates, installments, payments).
- [[LINE Integration]] — per-OA webhook, OCR (mock+gemini), matching, emoji bills, reminders.
- [[Group Slips & Tracking]] — group slips, org-wide match, sender/group registries, daily report.
- [[Multi-tenancy]] + [[Auth & RBAC]] — org scoping, super_admin/user, LINE+password login.
- Admin UI (neumorphic, responsive): dashboard, customers (detail/edit/import/search), banks, bills, slips, reports+CSV, senders, groups, LINE OA, settings; super-admin user console + impersonation.
- Hardening (partial): input validation, fail-fast prod secrets, pino logging+redaction, prisma migrations, separate test DB.

## Next (not built)

Tracked in detail in `/Users/.../.claude/plans/list-saas-temporal-axolotl.md`. Highlights:

- **Tenant isolation defense-in-depth** — Prisma client extension + Postgres RLS as a backstop to app-level `orgId` filtering ([[Multi-tenancy]]).
- **Secrets at rest** — encrypt LINE channel secret/token (currently plaintext, masked in API).
- **Auth hardening** — short access token + refresh + revocation; rate-limit/lockout on login.
- **Async core** — queue (BullMQ+Redis) for webhook OCR/push; in-app scheduler for jobs.
- **Storage** — S3/R2 + signed URLs for slips (financial PII; currently local disk).
- **Monetization (Phase C, deferred)** — plans/quota, payment processor (Stripe/Omise), billing lifecycle.
- **Compliance (TH PDPA)** — consent, export/delete, retention.
- **Product** — customer detail charts, reports trends, LIFF customer self-service, i18n.
- **Infra/CI** — Dockerfiles, GitHub Actions (lint/typecheck/test/build), managed Postgres+Redis, monitoring.

See [[Dev Workflow]] to start.
