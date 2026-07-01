# CLAUDE.md — bot-ban-lekha

## Project Overview

LINE OA bill-reminder system with three main capabilities:
1. **Bill reminders** — send daily/deadline/overdue messages to customers via LINE Messaging API
2. **OCR slip processing** — parse bank-transfer slip images posted in LINE groups and match them to installments
3. **Admin dashboard** — web UI for managing organizations, customers, bill plans, payments, and LINE OA accounts

Multi-tenant: one PostgreSQL database with row-level `org_id` scoping. Each business = one `Organization` row.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Bun |
| Backend framework | Elysia (TypeScript) |
| ORM | Prisma |
| Database | PostgreSQL (Docker, host port 5433) |
| Admin UI | React 18 + Vite + TanStack Query + Tailwind |
| Messaging | LINE Messaging API (webhooks) |
| OCR | Gemini (or mock) |
| Auth | JWT + LINE Login |

---

## Directory Layout

```
backend/
  src/
    app.ts          route wiring + error handler
    env.ts          env validation (fails fast on default secrets in prod)
    lib/            prisma, auth, jwt, line, logger, response, date, hash
    routes/         one file per resource
    services/       bill, payment, messages, ocr, oa, storage, audit
  prisma/
    schema.prisma
    migrations/
    seed.ts
admin/
  src/
    App.tsx         shell (super_admin console vs operational console)
    lib/            api.ts, auth.tsx, ui.tsx
    pages/          one per nav item
    components/ui/  primitives
docker-compose.yml  Postgres on port 5433
```

---

## Commands

### Backend

```bash
# Start Postgres
docker compose up -d

# Install & run
cd backend
bun install
bun run db:deploy          # apply pending migrations
bun run db:seed            # seed super admin + presets + default org
bun run dev                # API on :8787
```

### Backend tests (uses a SEPARATE test DB — never run against dev DB)

```bash
cd backend
bun run db:test:init       # create + migrate test DB (once per schema change)
bun test                   # runs against line_oa_billing_test via .env.test
```

### Schema migration

```bash
# After editing backend/prisma/schema.prisma:
bun run db:migrate -- --name <description>    # creates + applies migration on dev
# Then migrate test DB too:
DATABASE_URL=postgresql://billing:billing@localhost:5433/line_oa_billing_test bunx prisma migrate deploy
```

Always use `prisma migrate`, never `db push` (migrations must be versioned).

### Admin UI

```bash
cd admin
bun install
bun run dev      # :5173, proxies /api → :8787
bun run build    # production build
```

### LINE webhook tunnel (dev)

```bash
cd backend && bun run tunnel    # Cloudflare quick tunnel
# Paste the https://…/api/line/webhook/<oaId> URL into the LINE console
```

---

## Safety Rules

### Multi-tenancy (CRITICAL — do not break)

Every org-scoped Prisma query **must** include `orgId: ctx.orgId` in the `where` clause.  
`orgId` must come only from `authorize()` middleware, **never** from request body/query.

```ts
// CORRECT
await prisma.customer.findFirst({ where: { id, orgId: ctx.orgId } })

// WRONG — tenant data leak
await prisma.customer.findUnique({ where: { id } })
```

Run the `tenant-guard` agent (`.claude/agents/tenant-guard.md`) on any diff that touches routes or services.

### Payment & OCR

- Never auto-approve a payment without explicit admin confirmation unless `PAYMENT_AUTO_APPROVE_ENABLED=true`.
- OCR results are **untrusted** input — always validate parsed amount, date, and reference before matching.
- Do not lower or remove OCR rate-limit guards (`OCR_RATE_MAX`, `OCR_RATE_WINDOW_SEC`).

### Security

- Do not log or expose `channelSecret`, `channelAccessToken`, `JWT_SECRET`, or `passwordHash`.
- Do not read secrets from request bodies; pull them only from `env.ts`.
- Do not disable Elysia `t.Object(...)` validation on auth, payment, or webhook routes.
- Prod refuses to start with default `JWT_SECRET` / `ADMIN_API_KEY` / `SUPER_ADMIN_PASSWORD` — keep this check in `env.ts`.

### Database migrations

- Always create a migration with `prisma migrate dev` — never `db push` in production paths.
- Migrate the test DB after every schema change.
- Never drop or rename columns without a migration + data-migration plan.

### Secrets and env files

- `.env` and `.env.test` are gitignored — **never commit real credentials**.
- Only `.env.example` is committed; keep it up to date when adding new env vars.
- Do not write real secrets into any file, comment, or test fixture.

---

## Git & PR Rules

- **Never push directly to `main`**. Always work on a feature branch and open a PR.
- PRs must target `main`.
- Do not merge your own PR — request a human review.
- Reference the originating GitHub issue number in the PR description.
- Keep PRs focused: one issue → one PR. Large refactors should be split.

---

## Testing Checklist (before opening a PR)

- [ ] `bun test` passes in `backend/` (with test DB initialised)
- [ ] `bun run build` succeeds in `admin/`
- [ ] Tenant-isolation tests still green (`integration.test.ts`)
- [ ] No real secrets in any committed file
- [ ] `PAYMENT_AUTO_APPROVE_ENABLED` not hardcoded to `true`

---

## Key Concepts

- **Organization** — top-level tenant. Every domain row is scoped to one org.
- **Membership** — `AdminUser` ↔ `Organization` join with role `viewer | admin | owner`.
- **BillPlan** — a customer's repayment schedule; generates `BillInstallment` rows.
- **PaymentSubmission** — slip image received via LINE; goes through OCR → match → admin review.
- **Payment** — approved record that marks an installment as paid.
- **LineOaAccount** — a LINE channel (one per org); holds channel secret + access token.
