# Stackwise — Inventory, Quotations & Billing

A multi-tenant **inventory management + billing/quotation** app. Any business signs
up, picks an industry, and gets isolated inventory, GST-ready invoicing, and stock
tracking — mobile-friendly and installable as a PWA.

- **Multi-tenant self-serve signup** — each business gets its own isolated org, seeded with an industry preset (catering, restaurant, retail, pharmacy, manufacturing…)
- **Products** via manual entry or **CSV/XLSX import**
- **Configurable units** (kg, g, L, ml, piece, dozen, packet…) with conversions — restock in one unit, use in another
- **Restock / Use / Waste / Adjust** with an append-only **stock ledger**, cost-of-usage tracking, and optional linking to the bill an item was consumed for
- **Expiry / batch tracking** with **FEFO** (first-expiry-first-out) deduction
- **Quotations & GST invoices/bills** — CGST/SGST/IGST computed automatically, financial-year numbering, print-on-letterhead, owner-approval gate before printing/sending
- **Payments & outstanding tracking** on invoices
- **Low-stock, out-of-stock, expiring-soon & expired** alerts on the dashboard
- **Roles**: Owner (full control + approvals) / Admin (manage products, billing, team) / Staff (log stock)
- Installable **PWA**, works on desktop and phone

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + custom components |
| Database | PostgreSQL (Supabase in prod, Docker locally) |
| ORM | Drizzle ORM |
| Auth | In-app email + password (bcrypt + signed JWT cookie via `jose`) |
| Files | SheetJS (`xlsx`) + PapaParse |
| Hosting | Vercel (Hobby free tier) |

> **Auth note:** uses lightweight in-app credential auth (bcrypt + signed JWT
> cookie) instead of Supabase Auth/Clerk — portable, no vendor lock-in, works
> the same self-hosted or on Vercel. Includes forgot-password (via Resend,
> with a console-log fallback in local dev). Roles live on the `memberships` row.

## Local development

Requires Node 20+ and Docker.

```bash
# 1. Install deps
npm install

# 2. Start a local Postgres (or point DATABASE_URL at your own)
docker run -d --name inv-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=inventory -p 5433:5432 postgres:16-alpine

# 3. Configure env
cp .env.example .env.local      # already points at the Docker DB above

# 4. Create schema + seed catering data (units, categories, owner login)
npm run db:migrate
npm run db:seed

# 5. Run
npm run dev
```

Default login (change after first sign-in):

```
owner@catering.local  /  password123
```

### Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run test` | Run unit + FEFO/conversion tests (Vitest) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed org + catering unit/category preset + owner |
| `npm run db:studio` | Open Drizzle Studio |

## Local dev vs. production database

This project deliberately runs on **two separate databases**:

- **Local dev** → the Docker Postgres in `.env.local` (`localhost:5433`). Seeding
  this creates a demo login (`owner@catering.local` / `password123`) for
  development only. It never talks to the production database.
- **Production** → a Supabase Postgres project. Every business that signs up
  (via `/signup`) gets its own isolated organization inside it — there is no
  seeded demo account in production.

Company name, currency, GST details, logo and letterhead are **not** environment
variables — they're entered by each business through **Settings** (or at signup
for the company name), and stored per-organization in the database. The
`APP_ORG_NAME` / `APP_CURRENCY` / `APP_TIMEZONE` vars only affect the local
`npm run db:seed` script; they are not read anywhere at runtime and are not
needed in Vercel.

## Deploying free (Vercel + Supabase)

1. **Create a Supabase project** (free tier). Copy the Postgres connection string
   (Project Settings → Database → Connection string / URI — use the **Session
   pooler**, port 5432; the direct connection is IPv6-only and won't connect
   from most hosts/CI).
2. **Push the schema**: temporarily point `DATABASE_URL` at the Supabase URL and
   run `npm run db:migrate` (skip `db:seed` in production — there's no demo
   account there; real orgs are created via `/signup`).
3. **Create a public Storage bucket** named `org-assets` in the Supabase
   dashboard (Storage → New bucket → Public) — this is where uploaded
   logos/letterheads/signatures are stored.
4. **Deploy to Vercel** (Hobby free tier). Set env vars in the Vercel dashboard:
   - `DATABASE_URL` — the Supabase Session pooler connection string
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `SUPABASE_URL` — `https://<project-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API → service_role key
     (server-only secret; enables logo/letterhead uploads to Storage)
   - `RESEND_API_KEY` — free at [resend.com](https://resend.com); enables
     forgot-password emails to actually send (without it they're only logged
     to the server console, so login recovery silently won't work in prod)
   - `EMAIL_FROM` — e.g. `Stackwise <noreply@yourdomain.com>` (optional;
     defaults to Resend's sandbox sender, which has deliverability limits)
   - `APP_URL` — your production URL, used to build reset-password links
     (optional; falls back to Vercel's `VERCEL_URL`)
5. A daily **Vercel Cron** (`vercel.json`) pings `/api/health` to keep the free
   Supabase database awake.

**Cost:** ₹0 / $0 per month on the free tiers. Vercel Hobby is non-commercial;
move to Vercel Pro (~$20/mo) once this is a paid, commercial SaaS.

## Project structure

```
src/
  app/
    (app)/            # authenticated shell + pages
      dashboard/  products/  movements/  units/  import/  team/
    api/
      export/         # CSV/XLSX export
      health/         # DB health + cron keep-alive
    login/
  components/ui.tsx   # shared presentational components
  lib/
    db/               # Drizzle schema, connection, seed
    auth/             # sessions + role guards
    stock.ts          # core movement engine (FEFO, conversion, ledger)
    units.ts          # conversion + catering unit preset
    queries.ts        # tenant-scoped reads
```

## How stock math works

- Every product tracks stock in one **stock unit**; batches hold the actual quantities.
- A movement's quantity can be in **any convertible unit** (same unit group) and is
  converted via each unit's `factorToBase`.
- **Restock** creates a batch (optional expiry). **Use/Waste** draw down batches
  **FEFO** (soonest expiry first). **Adjust** corrects counts up or down.
- `products.currentStock` is always recomputed from remaining batch quantities, so it
  can never drift from the ledger. Every change is an immutable `stock_movements` row.
