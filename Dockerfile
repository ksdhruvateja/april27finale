FROM node:20-bookworm-slim

WORKDIR /app

# Use Corepack so the pinned pnpm version in package.json is respected.
RUN corepack enable

# Install dependencies first for better layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/dashboard/package.json artifacts/dashboard/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/db/package.json lib/db/package.json
COPY lib/object-storage-web/package.json lib/object-storage-web/package.json
COPY scripts/package.json scripts/package.json

RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts

# Copy full source and build the deploy artifacts.
COPY . .
RUN pnpm run build:railway

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
