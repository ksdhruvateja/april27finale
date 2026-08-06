FROM node:22-slim

# Disable corepack and install pnpm 9 directly (no corepack version-lock)
RUN corepack disable && npm install -g pnpm@10.26.1

WORKDIR /app

# Copy workspace manifests and root TypeScript configs
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json ./

# Copy all source packages
COPY lib/ ./lib/
COPY artifacts/ ./artifacts/
COPY scripts/ ./scripts/

# Install all dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Build dashboard (Vite) + api-server (esbuild)
RUN pnpm run build:railway

# Railway injects PORT at runtime; default to 8080 for local testing
ENV PORT=8080
EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
