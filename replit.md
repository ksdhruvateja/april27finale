# QuickBoo / Forez Backend

## Overview

QuickBooks-style business management platform backend ported from the Forez/QuickBoo project. Full-featured accounting API with invoices, customers, vendors, products, estimates, quotes, bills, purchase orders, inventory, shipments, expenses, bank accounts, tax rates, user auth with roles, and integrations with Dwolla (ACH) and Checkeeper (check printing).

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 20 (Replit environment)
- **Package manager**: pnpm 9.15.9
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: Neon PostgreSQL via `NEON_DATABASE_URL` (stored in `.env`)
- **Validation**: Zod (v3 for api-server routes), `drizzle-zod` + `zod/v4` for DB schemas
- **API schemas**: `@workspace/api-zod` (generated Zod schemas from OpenAPI)
- **Build**: esbuild (ESM bundle)

## How to Run on Replit

The **"Start application"** workflow starts both services:

- **Dashboard** (React/Vite): port 5173 — served through the Replit preview pane
- **API server** (Express 5): port 3000 — proxied from the dashboard via Vite's `/api` proxy

The workflow command:
1. Starts the Vite dev server for the dashboard
2. Builds the API server with esbuild (`node build.mjs`)
3. Starts the API server with `node --enable-source-maps dist/index.mjs`

> **Important (Replit quirk):** The workflow calls `node build.mjs` directly instead of `pnpm run build` to avoid Replit's corepack intercepting nested pnpm calls. When restarting after code changes to the API, the workflow will rebuild automatically.

## Installing Dependencies

```bash
COREPACK_ENABLE_STRICT=0 COREPACK_ENABLE_AUTO_PIN=0 /nix/store/9z31jjxbgf3i10z97r7yv2jvv7g9csms-pnpm-9.15.9/bin/pnpm install --frozen-lockfile
```

## Database

- Connection string: `NEON_DATABASE_URL` in `.env`
- Push schema changes (dev only):
  ```bash
  COREPACK_ENABLE_STRICT=0 /nix/store/9z31jjxbgf3i10z97r7yv2jvv7g9csms-pnpm-9.15.9/bin/pnpm --filter @workspace/db run push
  ```

## Default Login

- Email: `developer@gmail.com`
- Password: `developer143`
- Role: `developer` (full access)

## Project Structure

```
artifacts/
  api-server/          — Express 5 REST API (port 3000 in dev)
  dashboard/           — React + Vite frontend (port 5173 in dev)
  mockup-sandbox/      — Canvas component preview server
lib/
  db/                  — Drizzle ORM + schema definitions (16 tables)
  api-zod/             — Zod schemas generated from OpenAPI spec
  api-spec/            — OpenAPI spec
  api-client-react/    — React Query API client
```

## Optional Integrations

Set these env vars (or `.env`) to enable optional features:

- **Dwolla (ACH payments)**: `DWOLLA_KEY`, `DWOLLA_SECRET`, optionally `DWOLLA_ENV=production`
- **Checkeeper (check printing)**: `CHECKEEPER_TOKEN`
- **EasyShip (shipping)**: `EASYSHIP_API_KEY` — falls back to demo mode (6 simulated rates) when not set
- **Plaid (bank linking)**: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`

## User Preferences

- Use Neon PostgreSQL only (via `NEON_DATABASE_URL`); do not provision or use the Replit built-in database.
