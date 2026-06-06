# syntax=docker/dockerfile:1
# Build context = repo root (see docker-compose.prod.yml).

# ---------- builder ----------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN corepack enable

# Install with the full workspace (frozen-lockfile validates every importer, so all
# workspace manifests must be present).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY infra ./infra
COPY apps ./apps
RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter @vendorbridge/prisma generate \
 && pnpm --filter @vendorbridge/shared build \
 && pnpm --filter @vendorbridge/api build

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium for Puppeteer PDF rendering (degrades to HTML if it fails).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium fonts-liberation libnss3 libatk-bridge2.0-0 libgtk-3-0 \
      libasound2 libx11-xcb1 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Bring the fully-built workspace over (node_modules included for the prisma CLI).
COPY --from=builder /app /app

# Normalize line endings + make the entrypoint executable (safe when built on Windows).
RUN sed -i 's/\r$//' /app/apps/api/docker-entrypoint.sh \
 && chmod +x /app/apps/api/docker-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/app/apps/api/docker-entrypoint.sh"]
