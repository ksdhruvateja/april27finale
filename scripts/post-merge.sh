#!/bin/bash
set -e

# Install any new packages added by merged tasks
COREPACK_ENABLE_STRICT=0 pnpm install

# Push schema changes non-interactively (--force skips prompts)
COREPACK_ENABLE_STRICT=0 pnpm --filter @workspace/db run push-force
