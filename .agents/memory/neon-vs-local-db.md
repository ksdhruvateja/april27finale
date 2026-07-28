---
name: Neon vs Local DB for schema migrations
description: The API server uses NEON_DATABASE_URL from .env, but drizzle-kit push and psql in the shell default to DATABASE_URL (local postgres). Migrations must target Neon explicitly.
---

## Rule
`pnpm --filter @workspace/db run push` and bare `psql $DATABASE_URL` hit the **local** postgres (heliumdb), NOT the Neon cloud database the API server uses.

**Why:** The API server is started with `--env-file=/home/runner/workspace/.env` which loads `NEON_DATABASE_URL`. The shell environment does NOT have `NEON_DATABASE_URL` set, so drizzle-kit falls through to `DATABASE_URL` (local).

## How to Apply
For additive schema changes (ADD COLUMN, CREATE INDEX, etc.):
```bash
PGPASSWORD=$(grep NEON_DATABASE_URL .env | sed 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/') \
  psql "$(grep NEON_DATABASE_URL .env | cut -d= -f2-)" \
  -c "ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar jsonb DEFAULT '[]'::jsonb;"
```

For drizzle-kit push against Neon (only when no destructive ops present):
```bash
env $(cat .env | grep -v '^#' | xargs) pnpm --filter @workspace/db run push
```
**ALWAYS preview the diff first** — the push may flag data-loss ops (DROP TABLE, DROP COLUMN) from other divergences. Use direct SQL for safe additive changes instead.

## Danger Pattern
Running `drizzle-kit push` with Neon env can prompt to drop tables/columns that exist in Neon but not in the local schema. Never auto-confirm — always inspect and abort if data-loss ops appear.
