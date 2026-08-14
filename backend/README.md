# LINE OA Bill Reminder — Backend (Phase 1)

Bun + Elysia + Prisma + PostgreSQL. Backend/API only (no frontend yet).

## Run

```bash
docker compose up -d      # postgres (own container, host port 5433) — from repo root
bun install
bun run db:deploy         # apply migrations (prisma migrate deploy) — versioned, prod-safe
bun run db:seed           # seed super admin + cycle presets + default org/bank/OA
bun run dev               # http://localhost:8787
bun run db:test:init      # one-time: create + migrate the separate TEST database
bun test                  # runs against line_oa_billing_test (dev DB untouched)
```

Schema changes: edit `prisma/schema.prisma` → `bun run db:migrate` (creates a new migration). Deploy with `db:deploy`. (`db:push` kept for throwaway prototyping only.)

Database runs in its own container ([../docker-compose.yml](docker-compose.yml)): `postgres:16-alpine`, db `line_oa_billing`, user/pass `billing`, host port **5433** (5432 left for other projects). `DATABASE_URL` in `.env` points to it.

Set `DATABASE_URL` and LINE/admin keys in `.env` (see `.env.example`).

## Admin UI

React + Vite + Tailwind/shadcn app in [`../admin`](admin). Run the backend (`:8787`), then:

```bash
cd ../admin && bun install && bun run dev   # http://localhost:5173
```

Vite proxies `/api` → `:8787` (no CORS). Paste your `ADMIN_API_KEY` (saved in localStorage); manage customers / bank accounts / bill plans and review-match-approve-reject slips.

## Local + LINE (Cloudflare Tunnel)

LINE webhook needs a public HTTPS URL. Expose local `:8787` with a Cloudflare quick tunnel (no account/domain needed).

```bash
# terminal 1 — backend
bun run dev                      # http://localhost:8787

# terminal 2 — public HTTPS tunnel
bun run tunnel                   # cloudflared, prints https://<random>.trycloudflare.com
```

Then:

1. Copy the printed `https://<random>.trycloudflare.com` URL.
2. LINE Developers console → your Messaging API channel → **Webhook URL** =
   `https://<random>.trycloudflare.com/api/line/webhook` → **Verify** → enable "Use webhook".
3. Put the channel's **Channel secret** + **Channel access token** in `.env`:
   ```env
   LINE_CHANNEL_SECRET=...
   LINE_CHANNEL_ACCESS_TOKEN=...
   ```
   Restart `bun run dev`. Now signatures are verified and replies are really pushed.
4. (For real OCR) set `OCR_PROVIDER=gemini` + `OCR_API_KEY=...`.

Notes:
- Quick-tunnel URL changes every restart — re-paste it in the LINE console each time. For a stable URL use a named tunnel (`cloudflared tunnel create`) + your own domain.
- Without `LINE_CHANNEL_SECRET` the webhook skips signature checks (dev only). Set it before exposing anything real.

## Organizations (multi-tenant SaaS)

Sell to many businesses from one deployment. Two orthogonal axes:

- **Tenant isolation (`org_id`):** every domain row (line_oa_accounts, bank_accounts, customers, bill_plans, payment_submissions, payments, message_logs, audit_logs) carries `org_id`. Every API request is scoped to one org via the **`x-org-id`** header; queries filter by it. A caller can only touch orgs they belong to.
- **RBAC (`memberships`):** a user's role (`viewer`/`admin`/`owner`) lives in `memberships(org_id, admin_user_id, role)` — per org. One user can belong to many orgs with different roles.

Roles:
| route group | who |
|---|---|
| domain GET (`/api/customers` …) | any member (viewer+) |
| domain writes | admin+ of that org |
| `/api/line-oa-accounts`, `/api/members` | owner of that org |
| `/api/platform/*` (manage orgs) | **platform admin** only |

- **Super admin login (username/password):** `POST /api/auth/login {username,password}` → JWT (Argon2 via `Bun.password`). Seeded from `SUPER_ADMIN_USERNAME`/`SUPER_ADMIN_PASSWORD` as a **platform admin**. Default `superadmin`/`superadmin` — change in prod. (LINE login + break-glass `ADMIN_API_KEY` still work.)
- **Onboarding:** the **first** person to log in (LINE) also becomes a **platform admin**. You create orgs via `/api/platform/organizations` and seed each org's first owner by their LINE userId. Owners then add their own members (`/api/members`) and configure their own LINE OA (`/api/line-oa-accounts`).
- **Break-glass `ADMIN_API_KEY`** = platform admin; with `x-org-id` it acts as owner of that org.
- Billing-cycle presets are global; everything else is tenant-scoped.

## Slips in a LINE group (staff/collectors)

Besides 1:1 chats, the bot accepts slips posted in a **LINE group/room** (e.g. a collections team forwarding customers' slips).

- The webhook detects `source.type = group|room` and stores `payment_submissions.line_group_id` (the sender's `userId` is kept but **no customer is tied** — staff ≠ customer).
- **Matching is org-wide:** a group slip is scored against **all active installments in the org** (by amount + transfer date + reference). A confident unique hit → `auto_matched` (still `pending_review`); ambiguous/none → `needs_admin_match` (admin picks from the org's installments, each option shows the customer).
- On **approve**, the customer is resolved from the matched installment; the bill is posted **back into the group**. Replies (`payment_received` / `needs_admin` / `approved`) go to the group, not a DM.
- **Track the sender:** the slip's sender `userId` is captured and resolved to a name (auto from the LINE group-member profile, falls back to the id). Names live in a `line_senders` registry per org and show on each slip ("ส่งโดย …"). The **ผู้ส่งสลิป** page lists senders + slip counts and lets you rename them (rename backfills existing slips) — so you can always trace a slip back to who submitted it.
- **Daily report per group:** each group the bot collects from is remembered in `line_groups` (name auto-fetched from LINE). `GET /api/reports/daily?date=` returns slips **broken down per group** (received / approved / pending / needs-admin / rejected / approved-amount) plus a **combined** total — shown on the รายงาน page with a date picker.
- Non-image messages in a group are ignored (no help-text spam).
- **LINE console:** enable **"Allow bot to join group chats"** on the Messaging API channel, then add the OA to the group.

## Multiple LINE OA (per org)

Each LINE OA (Messaging API channel) is a row in `line_oa_accounts` (name, channel_id, channel_secret, channel_access_token) — managed in the admin UI (**owner** only; secrets are write-only, never returned).

- **Webhook is per-OA:** `POST /api/line/webhook/:oaId`. Configure each OA's LINE console with its own URL. Signature is verified with **that OA's** channel secret; image download + replies use **that OA's** access token.
- **Customers belong to an OA** (`customers.line_oa_id`). A LINE `userId` is provider-scoped, so the same person under two OAs = two customer rows — enforced by `unique(line_oa_id, line_user_id)`.
- **Submissions / message logs** carry `line_oa_id`; bills/installments/payments derive the OA via their customer.
- **Jobs** resolve each customer's OA token when sending; **rate-limit + duplicate guards** are scoped per OA.
- Seed creates a **Default OA** from the legacy `LINE_CHANNEL_*` env so a single-OA setup keeps working.

`ponytail:` secrets stored plaintext in DB, returned never (masked). Upgrade path: column encryption / KMS if the DB trust boundary tightens.

## Auth (2 roles: super_admin + user)

JWT-based (`Authorization: Bearer`). Two roles only:

| role | access |
|------|--------|
| **super_admin** (`is_platform_admin`) | sees the **user-management console only**; creates users + their org, resets passwords, activates; can **"enter" a user's org** (send `x-org-id`) to operate on their behalf |
| **user** (member of one org) | **full access within their own org only** (no viewer/admin/owner tiers) |

- **Every org-scoped request sends `x-org-id`.** A user may only act on the org they belong to (else 403); super_admin may act on any org they enter.
- **Logins:** username/password (`POST /api/auth/login`, super_admin seeded from `SUPER_ADMIN_*`), LINE Login (`/api/auth/line/login` → callback → `FRONTEND_URL/#token=`), or break-glass `x-api-key: $ADMIN_API_KEY` (= super_admin). `GET /api/auth/me` → `{ userId, name, isPlatformAdmin, org }`.
- **User management:** super_admin only, under `/api/platform/*` (`admin-users`, `organizations`). A user belongs to exactly one org; deactivation takes effect immediately (JWT re-checked vs DB each request).
- **Job APIs** (`/api/jobs/*`): `x-job-key: $INTERNAL_JOB_API_KEY`. **Webhook** (`/api/line/webhook/:oaId`): LINE signature verified per OA.

## Layout

- `src/lib/` — prisma, response envelope, auth, line (signature + push), date (Asia/Bangkok), emoji-number, hash.
- `src/services/` — bill (generate/render), messages (renderer + send/log), matching (scoring), payment (match/approve/reject txn), ocr (mock provider, swappable), storage (local), audit.
- `src/routes/` — one file per resource, mounted in `app.ts`.

## Notes / deliberate shortcuts (`ponytail:`)

- OCR: `OCR_PROVIDER=mock` (reads slip bytes as JSON in dev/test) or `gemini` (Google Gemini vision, set `OCR_API_KEY` + optional `OCR_MODEL`, default `gemini-2.5-flash`). Other providers slot into `getOcrService()`.
- Storage: local disk or Google Drive; an S3 driver can be added behind `storeSlip()` when needed.
- LINE push/getContent: no-op stubs when no access token, so the flow runs offline.
- Auto-approve disabled (`PAYMENT_AUTO_APPROVE_ENABLED=false`); auto-matched slips stay `pending_review`.
- Responses serialized to snake_case to match the spec contract.
