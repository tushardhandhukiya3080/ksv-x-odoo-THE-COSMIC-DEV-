# Deploying VendorBridge to your VPS

Single-host deploy: Caddy terminates HTTPS and reverse-proxies **web**, **api**, and **n8n**;
Postgres / Redis / Meilisearch / MinIO run as internal services. Everything is one
`docker compose` stack.

## 0. Prerequisites
- A VPS with Docker + the Compose plugin (`docker compose version`).
- A domain you control. You said you have both. ✅

## 1. DNS — point these at your VPS public IP
Create **A records** (replace `example.com` with your domain):

| Host | Type | Value |
|---|---|---|
| `app.example.com` | A | `<VPS_IP>` |
| `api.example.com` | A | `<VPS_IP>` |
| `n8n.example.com` | A | `<VPS_IP>` |

Wait for them to resolve (`ping app.example.com` shows the VPS IP). Caddy needs this to
issue Let's Encrypt certificates.

## 2. Get the code on the VPS
```bash
git clone <your-repo-url> vendorbridge && cd vendorbridge
# (or rsync/scp your local folder up)
```

## 3. Configure secrets
```bash
cp .env.production.example .env.production
# generate strong secrets:
openssl rand -hex 48   # paste into JWT_ACCESS_SECRET
openssl rand -hex 48   # paste into JWT_REFRESH_SECRET
nano .env.production   # set DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD, MEILI/MINIO keys
```
Set `SEED_ON_START=true` for the **first** boot (loads the demo org + users), then flip it
back to `false` and redeploy so it never reseeds.

## 4. Open the firewall
```bash
sudo ufw allow 80
sudo ufw allow 443
```

## 5. Build & launch
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
First run pulls images, builds the API (incl. Chromium for PDFs) and the web bundle, applies
the database schema (`prisma db push`), seeds if enabled, and brings up Caddy. Watch logs:
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f caddy api web
```

## 6. Verify
- `https://api.example.com/api/v1/health` → `{ "status": "ok", "db": "up" }`
- `https://api.example.com/api/docs` → Swagger
- `https://app.example.com` → sign in (`officer@vendorbridge.dev` / `Password123!` if seeded)

## 7. Razorpay webhook (when you add payments)
In the Razorpay dashboard add a webhook → `https://api.example.com/api/v1/payments/webhook`,
event `payment.captured`, secret = `RAZORPAY_WEBHOOK_SECRET`. The API verifies the HMAC
signature before marking an invoice PAID.

## Updates / redeploys
```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```
The API entrypoint re-applies any schema changes on each start.

## Backups (recommended)
```bash
# Postgres dump
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U vendorbridge vendorbridge > backup_$(date +%F).sql
```

## Notes
- **Migrations vs db push:** the entrypoint runs `prisma migrate deploy` if a committed
  `infra/prisma/migrations/` exists, otherwise `prisma db push`. For production change
  management, run `pnpm db:migrate` locally, commit the generated migration, and redeploy.
- **PDFs** work out of the box (Chromium is in the API image).
- **AI / WhatsApp / Razorpay** stay dormant until you set their env keys — the app degrades
  gracefully without them.
