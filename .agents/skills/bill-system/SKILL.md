---
name: bill-system
description: Conventions and workflows for the LINE OA bill-reminder repo (Bun + Elysia + Prisma backend in backend/, React + Vite admin in admin/). Use when adding/changing backend routes, services, Prisma schema, the admin UI, running the app, migrations, or tests in this project — especially anything touching org scoping (multi-tenant), auth/RBAC, LINE webhooks, OCR, or payment matching.
---

# Bill System — project conventions

Multi-tenant SaaS: each business = an **org**; the bot reminds customers of installment bills over LINE, receives transfer slips, OCRs + matches them, and replies. `backend/` (Bun + Elysia + Prisma + Postgres), `admin/` (React + Vite + Tailwind, neumorphic).

## Run / dev

```bash
docker compose up -d                 # Postgres (host port 5433)
cd backend && bun run db:deploy && bun run db:seed && bun run dev   # API :8787
cd backend && bun run db:test:init && bun test                     # tests on a SEPARATE test DB
cd admin   && bun run dev                                          # admin :5173 (proxies /api -> :8787)
```

- **Never run `bun test` against the dev DB** — `test` is wired to `.env.test` (`line_oa_billing_test`). Run `db:test:init` once after schema changes.
- Schema change → edit `backend/prisma/schema.prisma` → `bun run db:migrate -- --name <change>` → it auto-applies to dev; then `DATABASE_URL=...line_oa_billing_test bunx prisma migrate deploy` for the test DB. Do **not** go back to `db push`.

## The two non-negotiable invariants

1. **Tenant isolation.** Every org-scoped query MUST filter by `ctx.orgId`, and every create MUST set `orgId`. One missing `where` = cross-tenant data leak. Reads: `findFirst({ where: { id, orgId: ctx.orgId } })` (not `findUnique` by id alone). Lists/updates/deletes: include `orgId` in `where`.
2. **Auth.** Org routes use `authorize(headers, request.method)` (member of `x-org-id` = full access — there are **only** `super_admin` and `user`, no viewer/admin/owner tiers). Platform/user-management routes use `authorizePlatform(headers)`. Jobs use `requireJob`. See `backend/src/lib/auth.ts`.

## Adding a backend org-scoped route

```ts
export const fooRoutes = new Elysia({ prefix: "/api/foos" })
  .resolve(async ({ headers, request }: any) => ({ ctx: await authorize(headers, request.method) }))
  .get("/", async ({ ctx }: any) => ok(await prisma.foo.findMany({ where: { orgId: ctx.orgId } })))
  .post("/", async ({ body, ctx }: any) => {
    const f = await prisma.foo.create({ data: { orgId: ctx.orgId, /* ... */ } });
    await audit(prisma, { action: "create_foo", entityType: "foo", entityId: f.id, orgId: ctx.orgId, actorId: ctx.userId });
    return ok(f);
  }, { body: t.Object({ /* validate every body at the trust boundary */ }) });
```

Then `.use(fooRoutes)` in `backend/src/app.ts`. Validate auth + money + LINE bodies with Elysia `t`. Responses go through `ok()` which snake_cases keys + serializes Decimal/Date. Errors: `throw new ApiError(code, msg)` (codes in `backend/src/lib/response.ts`).

## LINE specifics

- Webhook is **per-OA**: `/api/line/webhook/:oaId`; signature verified with that OA's secret; push/download use that OA's token (`backend/src/lib/line.ts`). Channel secrets are stored per OA and **never returned** by the API (`publicOa`).
- **Group slips** (`source.type=group`): no customer tied, matched **org-wide**, reply pushed to the group; sender + group names tracked in `line_senders` / `line_groups`.
- OCR is behind `getOcrService()` (`mock` | `gemini`). Never trust OCR — slips stay `pending_review` until admin approve. Approve runs in a single transaction.
- Reply target pattern: `sub.lineGroupId ?? sub.lineUserId`.

## Frontend

- `admin/src/lib/api.ts` sends `Authorization: Bearer` (or dev `x-api-key`) + `x-org-id`. `auth.tsx` exposes `useAuth()` (super_admin sees user-management only + `enterOrg`/`exitOrg` impersonation; user operates own org).
- Pages call the API via TanStack Query (`useQuery` / `useMut`). Reuse `@/components/ui/*` (shadcn-style) + neumorphic classes (`neu-raised`, `neu-inset`).

## Secrets

Never log or return channel secrets / tokens / passwords (pino redaction in `backend/src/lib/logger.ts`). `.env` is gitignored — only `.env.example` is committed. Prod fails fast on default secrets (`backend/src/env.ts`).

See `vault/` for architecture/data-model/flow notes, and `backend/README.md` for setup.
