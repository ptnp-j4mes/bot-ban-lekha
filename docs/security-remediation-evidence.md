# Security remediation evidence

Baseline: `cfeac617fe6432e29480c8a3936c4bac7c618eb6`

Branch: `main` (fast-forwarded from `codex/security-remediation`)

| # | Finding | Commits | Code and regression evidence | Deployment gate |
|---|---|---|---|---|
| 1 | OCR payment approval | `9b1adc6`, `4d1f536` | OCR matching leaves review pending; no payment, paid balance, or approval notification. Settings writes enabling the legacy flag return validation errors; web and mobile controls explain manual approval. Covered by integration tests. | Code verified; production approval flow not run. |
| 2 | Unbounded installments | `b343e0c`, `add04cf`, `1ac69c8` | Shared finite integer cap is 1–1,000 in the generator, interval API, and custom-date API. Boundary/helper and excessive-request tests pass with no rows created. | Code verified; deployment migration/data check not run. |
| 3 | Webhook raw-body override | `c09f464`, `1ac69c8` | Signature verification uses the captured request bytes; exact signed, missing/invalid signature, and injected `__raw` cases pass. | Code verified; live LINE delivery not run. |
| 4 | Disabled organization access | `4617039`, `c29486d` | Shared member/LIFF guards, `/me`, webhooks, reminders, retries, and overdue updates exclude disabled organizations while platform access remains available. Revocation tests pass. | Code verified; production revocation/cron check not run. |
| 5 | Browser login session swapping | `291e38e`, `1ac69c8`, `3bec01a` | Fragment JWT acceptance was removed. Browser login uses a verifier-bound, five-minute, single-use completion code; wrong verifier, expiry, replay, and concurrent redemption tests pass. Prisma migration is applied to the disposable test DB, and the state cookie is Secure in production. | Code verified; production OAuth callback and migration rollout open. |
| 6 | Public customer documents | `32499e1`, `330321a`, `1ac69c8`, `1b60e89` | Customer uploads require a distinct private S3 bucket even when public storage is local; references are `s3://private...`, reads allow configured buckets only, and migration copies/verifies/deletes before updating references. S3/private-read and unknown-reference tests pass; the shared storage fixture now restores local mode for repeatable runs. | Deployment open: provision private bucket, disable anonymous access, migrate old copies, verify authorized download and anonymous denial. |
| 7 | Remote retention | `32499e1`, `330321a`, `1ac69c8` | Retention handles local, S3, Drive references, configured public URLs, missing objects, unknown references, and provider errors. References clear only after deletion or confirmed absence. | Code verified; provider credentials and production retention job not run. |
| 8 | Mobile cached data | `1ea3275`, `57c808d` | Both apps cancel and clear query caches during logout, replacement login, expiry, and scope changes; sensitive keys include identity scope. Admin Jest: 25 passed; customer Jest: 9 passed. | Code verified; device/runtime A→B verification not run. |
| 9 | CSV formulas | `8e4d087` | Formula prefixes hidden by whitespace/control characters are neutralized before CSV quoting while numeric fields and Thai text remain unchanged. Backend report test passes. | Code verified; supported spreadsheet application check not run. |

## Verification runs

- Backend: `101 pass`, `0 fail`, `362 expect()` calls using `STORAGE_DRIVER=local` against the disposable PostgreSQL database; schema reports up to date with 21 migrations.
- Admin: `rtk bun test tests` passed; `rtk bun run build` passed.
- Mobile: admin Jest `5 suites / 25 tests` passed with `--runInBand --forceExit`; customer Jest `3 suites / 9 tests` passed with `--runInBand`.
- Backend TypeScript: `rtk proxy bunx tsc --noEmit` passed.
- Prisma client: `rtk proxy bunx prisma generate` passed after the login-completion migration.

Implementation commits through `3bec01a` plus this evidence report; the pre-existing `admin/src/pages/BillPlans.tsx` change remains uncommitted. No production host, private bucket, OAuth callback, device runtime, or spreadsheet application was available for deployment verification, so those gates remain open.
