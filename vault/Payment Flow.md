# Payment Flow

Up: [[Home]] · Source: `backend/src/services/payment.ts`, `matching.ts`, `messages.ts`, `bill.ts`

## End to end

```
slip arrives ([[LINE Integration]]) → OCR → processSubmission()
  → candidates (1:1: customer's installments · group: org-wide — [[Group Slips & Tracking]])
  → decideMatch() score: amount +50, date +40, due-today +10, ref-unique +10
       ≥90 unique → auto_matched     else → needs_admin_match
  → always pending_review (OCR never auto-trusted)
  → reply: "ได้รับสลิป" / "แอดมินตรวจ"
admin → match (manual) → approve  → transaction:
  → create Payment, update installment (paid/partial), complete plan if all paid
  → send bill with ✅ back to chat/group, audit + message log
  → reject → reason → notify
```

Guards: duplicate slip (`reference_no` / `image_hash`), can't approve a paid installment, can't touch another org's submission ([[Multi-tenancy]]).

## Bill rendering (`messages.ts`)

- Status line: `15💸 490✅` (💸 stays, ✅ appended when paid).
- Body = the admin's bill **note** verbatim; footer = per-org `billFooter` (Settings) → env default.
- Emoji digits for bill no / dates (`lib/emoji-number.ts`), Buddhist-era 2-digit year.

## Reminders & jobs (`routes/jobs.ts`, `routes/installments.ts`)

- Daily/before-deadline reminders + mark-overdue + retry-failed — **idempotent** via `*_sent_at` columns. Job endpoints need `x-job-key` (external cron triggers them).
- Members can also trigger today's reminders for their org from the dashboard (`POST /api/installments/send-reminders`).

## Reports

- `GET /api/reports/summary` (collected / pending / overdue / customers) + `payments.csv` export.
- `GET /api/reports/daily` per-group — see [[Group Slips & Tracking]].

## Settings affecting this flow

Per-org `billFooter` + `timezone` via `GET/PATCH /api/settings`. See [[Data Model|Organization]].
