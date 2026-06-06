#!/bin/sh
# Apply the database schema, optionally seed, then start the API.
set -e

cd /app/infra/prisma

if [ -d migrations ] && [ -n "$(ls -A migrations 2>/dev/null)" ]; then
  echo "[entrypoint] Applying migrations (prisma migrate deploy)…"
  pnpm exec prisma migrate deploy
else
  echo "[entrypoint] No migrations found — syncing schema (prisma db push)…"
  pnpm exec prisma db push --skip-generate --accept-data-loss
fi

if [ "$SEED_ON_START" = "true" ]; then
  echo "[entrypoint] Seeding demo data…"
  pnpm exec tsx seed.ts || echo "[entrypoint] Seed skipped/failed (continuing)."
fi

cd /app/apps/api
echo "[entrypoint] Starting API…"
exec node dist/main.js
