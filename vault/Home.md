# 🏠 Bill System — Vault

LINE OA bill-reminder & payment-matching SaaS. Knowledge base for the repo (`backend/` Bun+Elysia+Prisma, `admin/` React+Vite).

## Map of content

- [[Architecture]] — components, request lifecycle, stack
- [[Data Model]] — Prisma tables + relations
- [[Auth & RBAC]] — super_admin vs user, JWT, login methods
- [[Multi-tenancy]] — org scoping, the isolation invariant
- [[LINE Integration]] — per-OA webhook, OCR, OA config
- [[Group Slips & Tracking]] — slips in LINE groups, sender/group registries
- [[Payment Flow]] — matching, approve, reminders, daily report
- [[Dev Workflow]] — run, migrate, test, deploy
- [[Roadmap]] — done + what's next

## One-liners to remember

- **Two roles only:** `super_admin` (manages users, impersonates an org) + `user` (full access in own org). See [[Auth & RBAC]].
- **Every org query is scoped by `orgId`.** Missing it = cross-tenant leak. See [[Multi-tenancy]].
- **Never trust OCR** — slips stay `pending_review` until approved. See [[Payment Flow]].
- **Webhook is per-OA** (`/api/line/webhook/:oaId`). See [[LINE Integration]].
- Tests run on a **separate DB**. See [[Dev Workflow]].
