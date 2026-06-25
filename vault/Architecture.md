# Architecture

Up: [[Home]]

## Components

- **backend/** — Bun runtime, Elysia HTTP framework, Prisma ORM, PostgreSQL. Serves the JSON API, LINE webhooks, and job endpoints.
- **admin/** — React + Vite + Tailwind (neumorphic, responsive). Talks to the API; in dev Vite proxies `/api` → `:8787`.
- **Postgres** — runs in Docker (`docker-compose.yml`, host port 5433).
- **LINE Messaging API** — one channel ("OA") per configured `line_oa_accounts` row; customers/staff chat with it.

## Request lifecycle (org-scoped route)

```
client → Authorization: Bearer <jwt> + x-org-id: <org>
  → Elysia .resolve(authorize)  → AuthContext { userId, isPlatformAdmin, orgId }
  → handler queries Prisma WHERE orgId = ctx.orgId
  → ok(data)  → snake_case + Decimal/Date serialized
```

See [[Auth & RBAC]] for the guard, [[Multi-tenancy]] for the scoping rule.

## Layout

```
backend/src/
  app.ts            wires all routes + onError
  env.ts            config + prod fail-fast on default secrets
  lib/              prisma, auth, jwt, line, logger, response, date, hash, emoji-number
  routes/           one file per resource (org routes use authorize; platform uses authorizePlatform)
  services/         bill, payment (matching+approve), messages (render+send), ocr, oa, storage, audit
  prisma/           schema.prisma + migrations/ + seed.ts
admin/src/
  App.tsx           shell: super_admin console vs operational console
  lib/              api.ts, auth.tsx (useAuth), ui.tsx
  components/ui/    shadcn-style primitives + neu styles
  pages/            one per nav item
```

## Key conventions

- Responses: `ok(data)` envelope `{ success, data, message }`, keys snake_cased.
- Errors: `throw new ApiError(code, msg)` → mapped in `lib/response.ts` (`VALIDATION_ERROR`, `NOT_FOUND`, `FORBIDDEN`, ...).
- Validation: Elysia `t.Object(...)` on auth/money/LINE bodies.
- Logging: pino with secret redaction (`lib/logger.ts`).

Related: [[Data Model]] · [[LINE Integration]] · [[Payment Flow]]
