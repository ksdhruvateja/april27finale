# april27finale

A full-stack financial operations dashboard built with React + Vite (frontend) and Express (backend), backed by a Neon PostgreSQL database.

## Stack

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui — lives in `artifacts/dashboard/`
- **Backend**: Express (Node.js, ESM) — lives in `artifacts/api-server/`
- **Database**: Neon PostgreSQL via Drizzle ORM — schema in `lib/db/src/schema/`
- **Shared libs**: `lib/api-spec` (OpenAPI), `lib/api-client-react` (React Query hooks), `lib/api-zod` (Zod schemas)
- **Package manager**: pnpm (monorepo)

## How to run

The **Start application** workflow runs both services together:
- Dashboard (Vite dev server): port 5173
- API server: port 3000

The Vite dev server proxies `/api/*` requests to the API server.

## Default login

- **Email**: `developer@gmail.com`
- **Password**: `developer143`

## Environment / secrets

| Key | Where | Purpose |
|-----|-------|---------|
| `NEON_DATABASE_URL` | Replit Secret | Primary Postgres connection (Neon) |
| `SESSION_SECRET` | Replit Secret | Express session signing |

Optional integrations (not required to run): `PLAID_CLIENT_ID`, `PLAID_SECRET`, `EASYSHIP_API_KEY`, `DWOLLA_KEY`, `DWOLLA_SECRET`, `CHECKEEPER_TOKEN`.

## Database schema

Run `pnpm --filter @workspace/db run push` to push schema changes. Review for data-loss warnings before confirming.

## Build API server

```bash
pnpm --filter @workspace/api-server run build
```

## User preferences

- Keep the existing monorepo structure and Neon database
