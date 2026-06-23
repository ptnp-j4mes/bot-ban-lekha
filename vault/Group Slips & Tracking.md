# Group Slips & Tracking

Up: [[Home]] · Related: [[LINE Integration]] · [[Payment Flow]]

Besides 1:1 chats, the bot accepts slips posted in a **LINE group/room** — e.g. a collections team forwarding customers' slips.

## How a group slip differs

- Detected by `source.type = group|room`; `payment_submissions.line_group_id` is set, and **no customer is tied** (the sender is staff, not the customer).
- **Matching is org-wide:** scored against *all* active installments in the org (amount + transfer date + reference). Confident unique hit → `auto_matched` (still `pending_review`); ambiguous/none → `needs_admin_match`.
- On approve, the customer is resolved from the matched installment; the bill is posted **back into the group**.
- Non-image messages in a group are ignored (no spam).

## Tracking who sent it

- **LineSender** registry — `(orgId, lineUserId) → name`. On a group slip the sender's name is auto-fetched from the LINE group-member profile (falls back to the id) and stored on the submission (`senderName`).
- **LineGroup** registry — `(orgId, lineGroupId) → name`, auto-fetched from the LINE group summary.
- Admin pages **ผู้ส่งสลิป** (`/api/senders`) and **กลุ่ม LINE** (`/api/groups`) list + rename; renaming backfills existing slips.

## Daily report

`GET /api/reports/daily?date=` → per-group breakdown (received / approved / pending / needs_admin / rejected / approved-amount) + a **combined** total. Surfaced on the รายงาน page. See [[Payment Flow]].

## Caveat

If several customers owe the same amount on the same day, a group slip is **ambiguous** → routed to admin match (safe, never guessed). To improve, have staff type the customer code under the slip and parse it.
