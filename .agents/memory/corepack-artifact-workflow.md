---
name: Corepack + artifact managed workflow fix
description: How to fix SIGABRT/EAGAIN failures in Replit artifact-managed workflow pre-steps caused by corepack interception.
---

## The Rule
Remove `"packageManager": "pnpm@X.Y.Z"` from the root `package.json` when Replit's artifact-managed workflows fail on their pre-step.

**Why:** The `packageManager` field activates Node.js corepack. Replit's artifact system runs a pre-step (`pnpm add pnpm@9.15.9 --allow-build=@pnpm/exe --no-dangerously-allow-all-builds ...`) before the dev command. Corepack intercepts this `pnpm` call and aborts with SIGABRT or EAGAIN. Setting `COREPACK_ENABLE_STRICT=0` as a global env var via `setEnvVars` is NOT sufficient — the pre-step does not pick it up. Removing the `packageManager` field disables corepack entirely for the project.

**How to apply:** When you see `pnpm add pnpm@X.Y.Z ... Command was killed with SIGABRT` or `spawnSync pnpm EAGAIN` in any `artifacts/<slug>: <service>` workflow log, remove `"packageManager"` from the workspace root `package.json`. Set `COREPACK_ENABLE_STRICT=0` + `COREPACK_ENABLE_AUTO_PIN=0` via `setEnvVars` as belt-and-suspenders. The project still uses pnpm normally — just without the corepack version-lock.

## api-server dev script must load .env
The artifact-managed `artifacts/api-server: API Server` workflow runs `pnpm --filter @workspace/api-server run dev`. The `dev` script must load the workspace `.env` manually:
```json
"dev": "node ./build.mjs && node --env-file=../../.env --enable-source-maps ./dist/index.mjs"
```
Without this, `NEON_DATABASE_URL` is not available and all routes return 500.
The production `start` script does NOT include `--env-file` (production env vars come from the platform).
