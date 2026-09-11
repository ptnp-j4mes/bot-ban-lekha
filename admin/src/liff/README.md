# Customer LIFF: pink dashboard

Mobile-first customer view matching the pink Rich Menu. This is a read-only UI; it does not create bills, approve payments, generate payment QR codes or upload slips. Admin pages, backend routes and the database are unchanged.

## Existing API contract

The app initializes LIFF and exchanges the raw LINE ID token with `POST /api/liff/session` using `{ id_token, oa_id }`. Only the backend-verified customer session is used for `GET /api/liff/me/balance`, `/me/installments` and `/me/payments`. All fields use the existing snake_case serializer.

`oa` is the internal `LineOaAccount.id`, not the OA public handle, LINE user ID or channel ID. Read query parameters only after `liff.init()` resolves. The `liff.state` fallback is read-only.

A page open or explicit refresh exchanges a fresh session rather than trusting a cached account. Tokens remain in sessionStorage with a page-memory fallback when WebView storage is blocked; never localStorage. Superseded requests are aborted. No private customer responses are intentionally cached, logged or persisted. Actual sessionStorage lifetime depends on the WebView.

## Meaning of amounts

- The hero's outstanding amount, count and next date come directly from `/me/balance`. This is the balance of active plans, including installments not yet due; it is not an overdue-only total.
- The tabs show the rows returned by `/me/installments`. The unpaid tab excludes paid/cancelled/fully allocated installments, sorts by date across bills, and does not sum a replacement for the backend balance.
- The existing installment DTO does not expose the parent plan's status. Therefore the next-date card deliberately does not infer a payable amount from a potentially inactive plan. The list may include historical/inactive plans; the hero remains authoritative for the active balance.
- Remaining amounts are rounded to satang and clamped at zero. Cancelled rows have no payable-balance row.
- History contains approved payments only; absent `paid_at`, the displayed date is explicitly labelled as the approval date. Pending slips are not shown as successful payments.

## Interface

`LiffApp.tsx` handles loading, retry, tabs and incremental display (10 rows at a time). `components.tsx` contains presentation components. `model.ts` contains formatting and selectors; `session.ts` contains the independently testable authentication bootstrap. `styles/liff.css` is scoped under `.liff-app`, without changing shared admin tokens.

Tabs support arrow keys, Home/End and visible focus; status badges use text and symbols in addition to colour. The viewport permits zoom, the footer respects safe areas, and loading animation respects reduced motion. Long names and monetary values can wrap.

The LINE button only closes an actual LIFF browser. An external browser receives manual instructions instead; there is no guessed OA chat URL or automatic message sending. Open the app from the intended OA Rich Menu to return to that chat.

## Run and verify

```sh
cd admin
bun install --frozen-lockfile
bun run test:liff       # Node 20+; uses the existing TypeScript dev dependency
bun run build          # existing TypeScript + Vite build; no Node added to Docker
```

Set `VITE_LIFF_ID` at build time and `LINE_LIFF_CHANNEL_ID` in the backend as documented in the existing environment examples. The LINE Login channel must permit `openid`. Configure the LIFF endpoint to the deployed `/liff.html`, then point the Rich Menu URI to:

```text
https://liff.line.me/{LIFF_ID}?view=bill&oa={INTERNAL_OA_ID}
```

Official SDK behaviour: https://developers.line.biz/en/docs/liff/developing-liff-apps/

Before rollout, verify in LINE on iOS and Android: a linked account, an unlinked account, external-browser login, refresh after session expiry, two OAs opened in succession, no outstanding balance, multiple bills, cancelled/partly paid rows, long lists, offline/retry and return to the intended chat. Inspect widths 320/390/430px, enlarged text and bottom safe-area spacing. Never use actual customer records as public screenshots.
