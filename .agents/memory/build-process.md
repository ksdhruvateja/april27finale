---
name: Build process
description: How to build and restart the API server in this project
---

After any backend change, build with the explicit pnpm path before restarting:

```
COREPACK_ENABLE_STRICT=0 /nix/store/9z31jjxbgf3i10z97r7yv2jvv7g9csms-pnpm-9.15.9/bin/pnpm --filter @workspace/api-server run build
```

**Why:** The `pnpm` alias (`/usr/bin/pnpm` or bare `pnpm`) fails with a node assertion error on this environment. The full store path is the only reliable way to invoke it.

**How to apply:** Whenever editing files in `artifacts/api-server/src/`, always run this build command before restarting the "Start application" workflow.
