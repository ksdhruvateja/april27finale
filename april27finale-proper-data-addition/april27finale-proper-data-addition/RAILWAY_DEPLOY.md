# Railway Deployment Guide

This repo is fully configured for Railway. The app serves both the API and dashboard from a single service.

## What's already done (no extra setup needed)
- All 23 database tables exist on Neon
- All data migrated from Replit PostgreSQL → Neon
- `railway.toml`, `Dockerfile`, and `nixpacks.toml` are configured
- No Railway PostgreSQL add-on needed — Neon is the database

---

## Steps to deploy on Railway

### 1) Push to GitHub

Push this repository to GitHub.

### 2) Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
2. Select your repository
3. Railway auto-detects `railway.toml` — no extra config needed

### 3) Set environment variables

In your Railway service → **Variables** tab, add:

| Variable | Value |
|---|---|
| `NEON_DATABASE_URL` | your Neon connection string (postgresql://...) |
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | any long random string |
| `ALLOWED_ORIGIN` | your Railway public URL (e.g. `https://yourapp.up.railway.app`) |

Optional (only if features are used):
- `EASYSHIP_API_KEY`
- `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
- `LOG_LEVEL` (defaults to `info`)

> **Note:** Railway injects `PORT` automatically — do not set it manually.

### 4) Deploy

Railway triggers a build automatically on every push. The build runs:
```
pnpm run build:railway
```
Which builds both the dashboard (Vite) and API server (esbuild). Start command:
```
node artifacts/api-server/dist/index.mjs
```

### 5) Verify

Once deployed, check:
- `GET https://yourapp.up.railway.app/api/healthz` → `{ "status": "ok" }`
- Open the root URL → dashboard loads
- Login: `developer@gmail.com` / `developer143`

---

## Schema changes (future)

If you ever update the Drizzle schema locally, push it to Neon by running:

```bash
NEON_DATABASE_URL="your-connection-string" pnpm --filter @workspace/db run push-force
```

---

## Common failures

| Symptom | Fix |
|---|---|
| Boot loop with DB error | `NEON_DATABASE_URL` missing or wrong |
| API 500s after deploy | Schema out of sync — run `push-force` against Neon |
| CORS errors from browser | Set `ALLOWED_ORIGIN` to your Railway domain |
| Login works but sessions lost on restart | Set `SESSION_SECRET` env var |
| Build fails on Vite step | Do not set `NODE_ENV=production` during install phase |

---

## Architecture

```
Railway Service (single container)
  ├── artifacts/api-server/   Express API on PORT (Railway-injected)
  │     └── serves dashboard static files from artifacts/dashboard/dist/public/
  └── Neon PostgreSQL (external, via NEON_DATABASE_URL)
```
