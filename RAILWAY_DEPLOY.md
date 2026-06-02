# Railway Deployment Guide

This repo is already configured for Railway in `railway.toml`:
- Build command: `pnpm run build:railway`
- Start command: `pnpm run start:railway`

The app serves both API and dashboard from one service.

## 1) Create the Railway project

1. Push your branch to GitHub.
2. In Railway, click **New Project** -> **Deploy from GitHub Repo**.
3. Select this repository.
4. Railway should detect `railway.toml` and use it automatically.

## 2) Add a PostgreSQL database

1. In the same Railway project, click **New** -> **Database** -> **PostgreSQL**.
2. Open your app service **Variables** tab.
3. Add:
  - `NEON_DATABASE_URL=<your neon connection string>`

Notes:
- The backend uses `NEON_DATABASE_URL` as the primary source.
- Fallback aliases are supported: `DATABASE_URL` and `database_url`.
- `PORT` is injected by Railway automatically.

## 3) Set app variables

Minimum required:
- `NODE_ENV=production`
- `NEON_DATABASE_URL=<your neon connection string>`

Optional variables (only if you use these features):
- `EASYSHIP_API_KEY`
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- `DWOLLA_KEY`, `DWOLLA_SECRET`, `DWOLLA_ENV`
- `CHECKEEPER_TOKEN`
- `LOG_LEVEL` (defaults to `info`)

Use `.env.railway.example` as your source-of-truth list.

## 4) First deploy

1. Trigger deploy (automatic on push, or click **Deploy** in Railway).
2. Wait for build and start to complete.
3. Open your service URL and verify:
   - `GET /api/healthz` returns `{ "status": "ok" }`

## 5) Run schema push (important)

Run this once after database is attached (and whenever schema changes):

```bash
pnpm --filter @workspace/db run push
```

How to run it:
- Option A: locally from your machine with `NEON_DATABASE_URL` set.
- Option B: Railway service shell/CLI with the same env vars.

## 6) Smoke test checklist

- `GET /api/healthz` is healthy.
- Login works with default dev user:
  - email: `developer@gmail.com`
  - password: `developer143`
- Dashboard loads from the same service URL.
- If enabled, integrations show configured status:
  - `GET /api/easyship/status`
  - `GET /api/plaid/status`

## 7) Production hardening

- Rotate default developer credentials after first login.
- Add a custom domain in Railway.
- Restrict who can access Railway project variables.
- Enable Railway alerts/log monitoring.

## Common failures

- **Build fails during `vite build`**: ensure `NEON_DATABASE_URL` is not required at build time; dashboard build needs devDependencies (`pnpm install --prod=false`). Do not set `NODE_ENV=production` until runtime if install skips dev packages.
- **Boot loop with DB error**: `NEON_DATABASE_URL` (or fallback alias) missing or invalid.
- **Deploy succeeds but endpoints fail**: schema not pushed yet; run `pnpm --filter @workspace/db run push`.
- **Integration errors**: missing provider keys (Plaid/Dwolla/Checkeeper/EasyShip).
