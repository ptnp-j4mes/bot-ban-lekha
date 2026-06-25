# LINE Integration

Up: [[Home]] · Source: `backend/src/routes/line.ts`, `backend/src/lib/line.ts`, `backend/src/services/ocr.ts`

## Per-OA webhook

Each [[Data Model|LineOaAccount]] = one Messaging API channel. Webhook URL is **per OA**: `POST /api/line/webhook/:oaId`.

- Signature verified with **that OA's** `channelSecret` (skipped only if unset, dev).
- Image download + replies use **that OA's** `channelAccessToken`.
- Channel secret/token are **write-only** in the API (`publicOa` masks them). See [[Auth & RBAC]] secrets rule.

## Event handling

```
message + image  → handleImage  → store slip → OCR → match → reply   ([[Payment Flow]])
message (other)  → 1:1: help text · group: stay quiet
follow/postback  → ack only
```

Guards before OCR (cost/abuse): **rate-limit** per (OA, sender), **duplicate** by image hash, **type/size** (real providers only).

## OCR

Behind `getOcrService()` — `mock` (reads slip bytes as JSON in dev/test) or `gemini` (vision, structured JSON, BE→CE date). Set `OCR_PROVIDER` + `OCR_API_KEY`. **OCR output is never auto-trusted** — see [[Payment Flow]].

## Customer side

A [[Data Model|Customer]] = a LINE user in 1:1 with an OA (`lineUserId` unique per OA). Admin links `customer_code` ↔ `line_user_id`. For slips posted in **groups**, see [[Group Slips & Tracking]].

## Reply target

`sub.lineGroupId ?? sub.lineUserId` — push back to the group, or the 1:1 chat.

## Setup

LINE console: set the per-OA webhook URL; for groups enable **"Allow bot to join group chats"**. Fill `LINE_CHANNEL_*` (or per-OA in the admin) + `LINE_LOGIN_*` for [[Auth & RBAC|admin login]].

Related: [[Group Slips & Tracking]] · [[Payment Flow]]
