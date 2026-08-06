---
name: Railway Dockerfile pnpm version
description: The Dockerfile must pin the exact pnpm version used in the Replit workspace or Railway builds fail with a lockfile mismatch.
---

## The Rule
In `Dockerfile`, always install the exact pnpm version that matches what is installed in the Replit workspace.

```dockerfile
RUN corepack disable && npm install -g pnpm@<exact-version>
```

Check the current workspace version with `pnpm --version`.

**Why:** The `pnpm-lock.yaml` records the pnpm version that generated it. Installing a different major or minor version during a Railway Docker build triggers `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` and the build fails.

**How to apply:** When pnpm is upgraded in Replit (e.g., via Nix or corepack), update the pinned version in `Dockerfile` to match before the next Railway deploy. The current pinned version is `pnpm@10.26.1`.
