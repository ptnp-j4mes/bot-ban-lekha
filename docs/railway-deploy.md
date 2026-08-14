# Railway deployment

Deploy the repository as three services in one Railway project. Only the admin service needs a public domain; it proxies `/api` to the backend over Railway's private network, so the browser, LINE Login callback, LIFF, and webhook all stay on one origin.

## 1. Create services

1. Add a Railway PostgreSQL service named `Postgres`.
2. Add a GitHub service named `backend` with repository root directory `/`. It uses the root `Dockerfile` and `railway.json`.
3. Add another service named `admin` with root directory `/admin`. It uses `admin/Dockerfile` and `admin/railway.json`.
4. Generate a public domain for `admin`. Keep PostgreSQL private. The backend may stay private because nginx exposes its `/api` routes through the admin domain.

Keep the backend at one replica while the reminder scheduler is in-process. Multiple replicas would run the same scheduler tick unless a leader lock is added.

## 2. Backend variables

Set these on the `backend` service. Use Railway reference variables where shown.

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_TIMEZONE=Asia/Bangkok
LOG_LEVEL=info

ADMIN_API_KEY=<random 32+ bytes>
INTERNAL_JOB_API_KEY=<random 32+ bytes>
JWT_SECRET=<random 32+ bytes>
SUPER_ADMIN_USERNAME=<admin username>
SUPER_ADMIN_PASSWORD=<strong initial password>

FRONTEND_URL=https://<admin-domain>
LINE_LOGIN_CHANNEL_ID=<optional LINE Login channel id>
LINE_LOGIN_CHANNEL_SECRET=<optional LINE Login channel secret>
LINE_LOGIN_REDIRECT_URI=https://<admin-domain>/api/auth/line/callback

LINE_LIFF_CHANNEL_ID=<customer LIFF channel id>
OCR_PROVIDER=gemini
OCR_API_KEY=<Gemini API key>
OCR_MODEL=gemini-2.5-flash

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/storage
SLIP_RETENTION_DAYS=30
PAYMENT_AUTO_APPROVE_ENABLED=false
```

Generate independent secrets, for example with `openssl rand -hex 32`. Do not copy values from `.env.example` into production.

## 3. Admin variables

Set these on the `admin` service:

```env
BACKEND_HOST=${{backend.RAILWAY_PRIVATE_DOMAIN}}
BACKEND_PORT=${{backend.PORT}}
VITE_API_BASE=
VITE_LIFF_ID=<LIFF app id>
```

`PORT` is injected by Railway and nginx binds to it automatically. `VITE_LIFF_ID` is a Docker build argument and is compiled into the static bundle, so redeploy admin after changing it.

## 4. Persistent slips

When `STORAGE_DRIVER=local`, attach a Railway volume to the backend at `/app/storage`. Without the volume, stored slip images disappear when the container is replaced. Alternatively configure the Google Drive storage driver in Platform Settings after the first login.

Enable backups for both PostgreSQL and the slip volume before onboarding real customers.

## 5. LINE configuration

After the first login, create the organization and LINE OA account in the admin UI. Use the generated OA id in the Messaging API webhook URL:

```text
https://<admin-domain>/api/line/webhook/<oaId>
```

Configure the LINE Login callback exactly as:

```text
https://<admin-domain>/api/auth/line/callback
```

Configure the LIFF endpoint as:

```text
https://<admin-domain>/liff.html?oa=<oaId>
```

## 6. Smoke test

1. Confirm the admin deployment health check `/health` is green.
2. Confirm `https://<admin-domain>/api/auth/me` returns `401` before login, proving the nginx proxy reaches the backend.
3. Log in with the seeded super admin and change the initial password.
4. Add a LINE OA, verify its webhook in LINE Developers, and send a test message.
5. Upload a test slip and confirm its image remains available after a backend redeploy.
