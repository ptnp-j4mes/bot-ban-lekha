# LINE OA Bill Reminder

Multi-tenant SaaS: reminds customers of installment bills over LINE, receives transfer slips, OCRs and matches them.

- **Backend** — `backend/` (Bun + Elysia + Prisma + PostgreSQL, port 8787)
- **Admin UI** — `admin/` (React + Vite + Tailwind, port 5173)

## Quick start — Docker Compose

```bash
cp .env.example .env        # fill in secrets (LINE keys, strong JWT_SECRET, etc.)
docker compose up --build   # builds images and starts all services
```

Services started:

| Service  | URL                          | Notes                              |
|----------|------------------------------|------------------------------------|
| Admin UI | http://localhost:5173        | React SPA served by nginx          |
| Backend  | http://localhost:8787/health | `/health` liveness; `/ready` checks PostgreSQL |
| Postgres | localhost:5433               | `line_oa_billing` db               |

The backend runs `prisma migrate deploy` and the idempotent seed automatically before accepting requests. Production seeds only the super admin (`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`); development also creates demo data.

### Useful commands

```bash
docker compose down           # stop containers (data volume preserved)
docker compose down -v        # stop and delete the postgres volume
docker compose logs -f        # tail all service logs
docker compose logs -f backend  # tail backend only
```

## Local dev (without Docker for backend/admin)

For faster iteration (hot-reload, direct DB access):

```bash
docker compose up -d postgres           # Postgres only
cd backend && bun install && bun run db:deploy && bun run db:seed && bun run dev
cd admin   && bun install && bun run dev
```

See [`backend/README.md`](backend/README.md) for the full setup guide including LINE webhooks and Cloudflare tunnels.

## Production deployment

- VPS/Docker Compose: use `docker-compose.prod.yml` behind an HTTPS reverse proxy.
- สำหรับ deploy บน VPS ให้ใช้ `./scripts/deploy-prod.sh` เพื่อหยุด `backend` และ `admin` ก่อน build แล้วค่อยเริ่ม service ใหม่ โดยไม่ลบ PostgreSQL volume
- Railway: create separate backend, admin, and PostgreSQL services following [`docs/railway-deploy.md`](docs/railway-deploy.md).

## Secrets

Copy `.env.example` to `.env`. Never commit `.env`. The backend refuses to start in `NODE_ENV=production` if `JWT_SECRET`, `ADMIN_API_KEY`, `INTERNAL_JOB_API_KEY`, or `SUPER_ADMIN_PASSWORD` are left at their insecure defaults.
