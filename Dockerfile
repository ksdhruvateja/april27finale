FROM node:20-bookworm-slim

WORKDIR /app

# Use Corepack so the pinned pnpm version in package.json is respected.
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts
RUN pnpm run build:railway

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "artifacts/api-server/dist/index.mjs"]
