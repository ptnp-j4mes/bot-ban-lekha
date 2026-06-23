# Bill Admin (frontend)

React + Vite + TypeScript + Tailwind + shadcn-style components + TanStack Query.

```bash
bun install
bun run dev      # http://localhost:5173 (proxies /api -> backend :8787)
bun run build    # type-check + production build -> dist/
```

Start the backend first (`cd ../backend && bun run dev`). Enter your `ADMIN_API_KEY` in the top bar (stored in localStorage, sent as `x-api-key`).

Pages: Dashboard (due-today / overdue / pending), ลูกค้า, บัญชีรับโอน, สร้างบิล, สลิป/อนุมัติ (match → approve/reject).

Prod: set `VITE_API_BASE` to the backend origin and serve `dist/` (the dev `/api` proxy only runs under `vite dev`).
