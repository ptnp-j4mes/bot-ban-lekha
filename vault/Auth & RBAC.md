# Auth & RBAC

Up: [[Home]] · Source: `backend/src/lib/auth.ts`, `backend/src/routes/auth.ts`, `backend/src/routes/platform.ts`

## Two roles only

| role | who | sees |
|------|-----|------|
| **super_admin** | `AdminUser.isPlatformAdmin = true` | **user-management console only**; can "enter" (impersonate) any org via `x-org-id` to operate on its data |
| **user** | member of one org | **full access within their own org** — no viewer/admin/owner tiers |

There is no per-feature permission matrix. A member of an org can do everything in that org. See [[Multi-tenancy]] for how scoping is enforced.

## Login methods → JWT (HS256, `lib/jwt.ts`)

- **Username/password** — `POST /api/auth/login` (Argon2 via `Bun.password`). Super admin seeded from `SUPER_ADMIN_*`.
- **LINE Login OAuth** — `/api/auth/line/login` → callback → `FRONTEND_URL/#token=`.
- **Break-glass** — `x-api-key: $ADMIN_API_KEY` = super_admin (scripts/curl/dev).

`GET /api/auth/me` → `{ userId, name, isPlatformAdmin, org }`. `POST /api/auth/change-password` for the logged-in user.

## Guards

- `authorize(headers, method)` — org routes. Requires `x-org-id`; super_admin may enter any org, a user only their own (membership check); else 403/400.
- `authorizePlatform(headers)` — super-admin-only (`/api/platform/*`: manage users + orgs).
- `requireJob(headers)` — internal job endpoints (`x-job-key`).

JWT is **re-checked against the DB every request** (deactivation takes effect immediately).

## Frontend

`admin/src/lib/auth.tsx` `useAuth()` → super_admin sees [[Home|Users console]] + `enterOrg`/`exitOrg`; a user lands straight in the operational console scoped to their org. `canWrite` is always true for members.

Related: [[Multi-tenancy]] · [[Architecture]]
