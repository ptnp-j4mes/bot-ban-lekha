## Summary

<!-- One or two sentences. What does this PR do and why? -->

Closes #<!-- issue number -->

---

## Changes

<!-- Bullet list of files changed and what each change does. Be explicit. -->

- 

---

## Acceptance Criteria

<!-- Copy the checklist from the issue. Every box must be checked before merge. -->

- [ ] 
- [ ] 

---

## Test Plan

<!-- How was this tested? Check every item that applies. -->

- [ ] `bun test` passes in `backend/` (test DB initialised with `bun run db:test:init`)
- [ ] `bun run build` succeeds in `admin/`
- [ ] Tenant-isolation tests green (`integration.test.ts`)
- [ ] New or updated test covers the change
- [ ] Manual smoke test performed (describe below)

**Manual test notes:**

<!-- What did you manually verify? Steps + result. -->

---

## Safety Checklist

- [ ] No real secrets committed (no `.env` contents, no API keys, no tokens)
- [ ] Multi-tenancy: every new Prisma query includes `orgId: ctx.orgId` in `where`
- [ ] Payment logic unchanged **or** explicitly reviewed and safe
- [ ] OCR logic unchanged **or** rate-limit guards preserved
- [ ] Auth/RBAC unchanged **or** explicitly reviewed and safe
- [ ] Schema migration included **if** `schema.prisma` was modified
- [ ] `PAYMENT_AUTO_APPROVE_ENABLED` not hardcoded to `true`

---

## Out of Scope

<!-- What did this PR deliberately NOT change? Prevents scope creep. -->

- 

---

## Screenshots / Logs (if applicable)

<!-- UI changes: before/after screenshots. API changes: sample request/response. -->
