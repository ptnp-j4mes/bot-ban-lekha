# Dev Workflow

Up: [[Home]]

## Run locally

```bash
docker compose up -d                       # Postgres on host port 5433
cd backend
bun install
bun run db:deploy                          # apply migrations (prisma migrate deploy)
bun run db:seed                            # super admin + presets + default org/bank/OA
bun run dev                                # API on :8787
# new terminal
cd admin && bun install && bun run dev     # admin on :5173 (proxies /api → :8787)
```

Super admin login (seed): `superadmin` / `superadmin` (change in prod). See [[Auth & RBAC]].

## Tests — separate DB (important)

```bash
cd backend
bun run db:test:init      # creates + migrates line_oa_billing_test (run once after schema changes)
bun test                  # runs against the TEST DB via .env.test — dev DB untouched
```

Never run `bun test` against the dev DB (it would pollute it). 36+ tests; keep them green, especially [[Multi-tenancy|tenant-isolation]] ones.

## Schema changes

```bash
# edit backend/prisma/schema.prisma, then:
bun run db:migrate -- --name <change>      # prisma migrate dev → creates + applies migration on dev
DATABASE_URL=postgresql://billing:billing@localhost:5433/line_oa_billing_test bunx prisma migrate deploy
```

Use `prisma migrate`, **not** `db push` (versioned, prod-safe). Migrations live in `prisma/migrations/`.

## Public webhook for LINE (dev)

`cd backend && bun run tunnel` → Cloudflare quick tunnel → put `https://…/api/line/webhook/<oaId>` in the LINE console. See [[LINE Integration]].

## Secrets

`.env` / `.env.test` are gitignored; only `.env.example` committed. Prod refuses to boot with default `JWT_SECRET` / `ADMIN_API_KEY` / `SUPER_ADMIN_PASSWORD` (`backend/src/env.ts`).

## Conventions

Adding a route / page → follow the `bill-system` skill (`.claude/skills/bill-system/SKILL.md`). Before committing, optionally run the [[Home|tenant-guard]] agent on the diff.

Related: [[Architecture]] · [[Roadmap]]
