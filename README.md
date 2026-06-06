# VendorBridge

**Procurement & Vendor Management ERP** — vendors → RFQ → quotations → comparison →
approval → purchase order → invoice (PDF) → payment, with an AI-assisted comparison panel,
hash-chained audit ledger, and a token-based vendor portal.

**The procurement core (vendor management through invoicing) is complete and verified.**
Further layers — AI quotation analysis, Razorpay payments, audit anchoring, real-time updates,
instant search, logistics, and a global-trade module — are scaffolded and degrade gracefully
when their external services aren't configured.

---

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| API | NestJS + TypeScript (REST `/api/v1`, Swagger `/api/docs`, RBAC guards, JWT) |
| Web | Next.js 14 (App Router) + Tailwind + TanStack Query |
| DB | PostgreSQL via Prisma (multi-tenant by `organizationId`) |
| Infra | Redis, Meilisearch, MinIO, n8n — all via `docker-compose.yml` |
| PDF | Puppeteer (degrades to HTML when Chromium is absent) |
| Payments | Razorpay (server-side orders + webhook signature verification) |

## Layout

```
apps/api        NestJS API
apps/web        Next.js frontend
packages/shared @vendorbridge/shared — Zod schemas, enums, money math
packages/config Shared tsconfig
infra/prisma    Schema, migrations, seed
infra/n8n       n8n workflow JSON
```

## Quick start (local)

```bash
# 1. Install
pnpm install

# 2. Copy env and start infrastructure
cp .env.example .env
docker compose up -d        # postgres, redis, meilisearch, minio, n8n

# 3. Database: migrate + seed demo data
pnpm db:generate
pnpm db:migrate             # creates the schema
pnpm db:seed                # 1 org + a user per role + sample vendors

# 4. Run both apps
pnpm dev                    # api → :4000, web → :3000
```

Open **http://localhost:3000** and sign in (seed password `Password123!`):

| Role | Email |
|---|---|
| Admin | admin@vendorbridge.dev |
| Procurement Officer | officer@vendorbridge.dev |
| Approver | approver@vendorbridge.dev |
| Vendor | vendor@steelco.dev |

> **PDFs:** to enable real PDF rendering run `npx puppeteer browsers install chrome` in
> `apps/api`. Without it, PO/Invoice endpoints serve the styled HTML document instead.

## Phase 1 demo run-through (acceptance)

1. **Officer** → Vendors → add/search vendors.
2. **Officer** → RFQs → *New RFQ* with line items → opens RFQ detail.
3. RFQ detail → *Invite vendors* → **Copy portal link**.
4. Open the portal link (incognito) → enter pricing + delivery → **Submit quotation**.
5. Back in RFQ detail → **Quotation comparison** (lowest/fastest highlighted) →
   **✨ AI recommendation** (LLM if `LLM_API_KEY` set, else deterministic baseline).
6. *Request approval* → pick an Approver.
7. **Approver** → Approvals → **Approve** (RFQ becomes `AWARDED`).
8. Officer → RFQ detail → **Generate PO** → Purchase Orders → **PDF**.
9. Purchase Orders → **Generate invoice** → Invoices → **PDF**, **Send**, **Pay**.
10. Every step writes an append-only, hash-chained `AuditLog` row (verify via `GET /audit-logs/verify`).

## Useful scripts

```bash
pnpm dev          # run api + web (turbo)
pnpm build        # build everything
pnpm typecheck    # tsc across all packages
pnpm db:studio    # Prisma Studio
pnpm db:seed      # reseed demo data
```

## Default business rules

PO/invoice numbering (`PO-{YYYY}-{seq}`), default 18% GST, single-step approval (multi-step
ready), and quotation locking are centralized in `packages/shared` and easy to change.

## Deployment

`docker-compose` for all services behind **Caddy** (`Caddyfile`) for automatic HTTPS on the
VPS, with subdomains `app.` / `api.` / `n8n.`. CI in `.github/workflows/ci.yml`.
