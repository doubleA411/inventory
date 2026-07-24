# StockKitchen — Inventory & Stock Management

A simple, mobile-friendly **stock management app** built for a catering business (v1),
structured so it can grow into a multi-tenant SaaS later without a rewrite.

- **Products** via manual entry or **CSV/XLSX import**
- **Configurable units** (kg, g, L, ml, piece, dozen, packet…) with conversions — restock in one unit, use in another
- **Restock / Use / Waste / Adjust** with an append-only **stock ledger**
- **Expiry / batch tracking** with **FEFO** (first-expiry-first-out) deduction
- **Low-stock, out-of-stock, expiring-soon & expired** alerts on the dashboard
- **Roles**: Owner / Admin (manage products, units, team) vs Staff (log stock)
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

> **Auth note:** v1 uses lightweight in-app credential auth (portable, no external
> dependency, self-host friendly) instead of Supabase Auth. Roles live on the
> `memberships` row. It can be swapped for Supabase Auth / Clerk when going multi-tenant.

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

## Deploying free (Vercel + Supabase)

1. **Create a Supabase project** (free tier). Copy the Postgres connection string
   (Project Settings → Database → Connection string / URI, append `?sslmode=require`).
2. **Push the schema**: set `DATABASE_URL` to the Supabase URL locally and run
   `npm run db:migrate && npm run db:seed`.
3. **Deploy to Vercel** (Hobby free tier). Set env vars in the Vercel dashboard:
   - `DATABASE_URL` — the Supabase connection string
   - `AUTH_SECRET` — `openssl rand -base64 32`
   - `APP_ORG_NAME`, `APP_CURRENCY` (INR), `APP_TIMEZONE` (Asia/Kolkata)
4. A daily **Vercel Cron** (`vercel.json`) pings `/api/health` to keep the free
   Supabase database awake.

**Cost:** ₹0 / $0 per month for one business on the free tiers. Vercel Hobby is
non-commercial; move to Vercel Pro (~$20/mo) when this becomes a paid SaaS.

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
