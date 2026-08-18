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
