<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying: migrations are NOT automatic

`npm run build` is plain `next build` — nothing applies migrations on deploy. Vercel will
happily report a `● Ready` deployment while production's schema is behind the code, which
surfaces as a runtime `column ... does not exist` error on every authenticated page
(`getAuthContext` in `src/lib/auth/index.ts` selects *all* `organizations` columns, so any
missing column takes down the whole app, not just the new feature).

After generating a migration, apply it to production explicitly:

```
npm run db:migrate        # local Docker DB   (.env.local)
npm run db:migrate:prod   # Supabase prod     (.env.production.local)
```

`drizzle.config.ts` picks its env file from `DRIZZLE_ENV` and prints the target host before
connecting — check that line says the database you meant.

Never fake a row in `drizzle.__drizzle_migrations` to make `migrate` skip a migration; it
marks the migration applied without running its SQL and hides the drift until something
breaks in production.

Three things now enforce this, so you shouldn't have to remember it:

- **Production builds migrate first.** `build` runs `scripts/migrate-deploy.mjs`, which
  applies pending migrations when `VERCEL_ENV=production` and fails the build if they
  error — so a deploy can't go live against a schema it doesn't match. Preview and local
  builds skip it and can never touch the production database.
- **`push`/`drop` are blocked against remote databases.** They change the schema without
  writing a `__drizzle_migrations` row, which is exactly how 0021 drifted.
  `drizzle.config.ts` throws rather than let them run anywhere but localhost.
- **`/api/health` reports drift.** It diffs every column and enum value in `schema.ts`
  against the live catalog and returns 503 listing what's missing. The daily cron already
  hits it, so drift from any source — including hand-edits in the Supabase console —
  surfaces within a day instead of as a user-facing 500.
