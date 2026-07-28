---
name: Neon migration — shell env vs --env-file
description: Critical: $NEON_DATABASE_URL is NOT set in the Replit shell; psql "$NEON_DATABASE_URL" silently hits local heliumdb. Always extract from .env to migrate Neon.
---

# Neon migration: shell ENV vs --env-file

## The Rule
When running schema migrations against Neon, **never** use `psql "$NEON_DATABASE_URL"` directly from the shell. `$NEON_DATABASE_URL` is **not** in the Replit shell environment — it only lives in `.env`. The variable expands to empty, so psql silently connects to local heliumdb instead of Neon. The ALTER TABLE appears to succeed (or says "already exists"), but Neon never receives the change.

**Always extract from .env first:**
```bash
NEON_URL=$(grep "^NEON_DATABASE_URL=" /home/runner/workspace/.env | cut -d= -f2-)
psql "$NEON_URL" -c "ALTER TABLE ..."
```

**Why:**
Drizzle-kit push / the API server use `--env-file=/home/runner/workspace/.env` which loads NEON_DATABASE_URL, so the API connects to Neon. But the shell process itself does NOT inherit this variable — `echo $NEON_DATABASE_URL` may show something in some contexts but `psql "$NEON_DATABASE_URL"` hits heliumdb (confirmed via `SELECT current_database()` returning `heliumdb`).

**How to apply:**
- Any additive schema change (ADD COLUMN, CREATE INDEX, etc.) must be run against BOTH local heliumdb (`psql "$DATABASE_URL"`) AND Neon (using the grep-extracted URL above).
- Verify migration landed on Neon: `psql "$NEON_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='...' AND column_name='...';"` should return 1 row.
- After migrating Neon, restart the workflow so the API pool creates fresh connections.
