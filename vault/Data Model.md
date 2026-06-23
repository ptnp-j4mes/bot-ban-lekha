# Data Model

Up: [[Home]] · Source: `backend/prisma/schema.prisma`

Almost every table carries **`org_id`** (the tenant anchor — see [[Multi-tenancy]]).

## Identity / tenancy

- **Organization** — a tenant (one business). Has `timezone`, `billFooter` ([[Payment Flow]] settings).
- **AdminUser** — `username`+`passwordHash` and/or `lineUserId`; `isPlatformAdmin` = super_admin. See [[Auth & RBAC]].
- **Membership** — `(orgId, adminUserId, role)`. A user belongs to one org; `role` collapsed to `user`.

## Billing

- **Customer** — `orgId`, `customerCode` (unique per org), optional `lineOaId` + `lineUserId` (unique per OA), `status`.
- **BankAccount** — receiving account, `isDefault`/`isActive`, per org.
- **BillPlan** — head of a bill: `billNo`, `principalAmount`, `installmentAmount`, `cycleType` (`interval_days` | `custom_dates`), `cycleDays`, `totalInstallments`, `startDate`, `status`.
- **BillInstallment** — one due item: `installmentNo`, `dueDate`, `amountDue`, `amountPaid`, `status` (pending/partial_paid/paid/overdue/cancelled), `morningSentAt`...
- **Payment** — real payment after approve; links `paymentSubmissionId` + `billInstallmentId`.
- **BillingCyclePreset** — global helper values (3/5/7 days), not org-scoped.

## LINE

- **LineOaAccount** — a Messaging API channel: `channelId/Secret/AccessToken` (secrets never returned). See [[LINE Integration]].
- **PaymentSubmission** — an incoming slip: `lineOaId`, `customerId?`, `lineUserId` (sender), `lineGroupId?`, `senderName?`, OCR fields, `matchStatus`, `matchedInstallmentId`, `reviewStatus`.
- **LineSender** / **LineGroup** — registries mapping LINE `userId`/`groupId` → a name. See [[Group Slips & Tracking]].

## Logs

- **MessageLog** — every LINE push (type, status, error). **AuditLog** — important actions (`org_id`, actor, old/new).

## Migrations

Versioned in `prisma/migrations/`. Flow in [[Dev Workflow]].
