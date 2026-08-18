/**
 * Applies pending Drizzle migrations before the production build.
 *
 * Wired into `npm run build`, so a deploy physically cannot go live against a
 * schema it doesn't match: if a migration fails this exits non-zero, the build
 * fails, and Vercel keeps serving the previous working deployment.
 *
 * Runs ONLY for production deploys. Preview builds and local `npm run build`
 * skip it, so they can never mutate the production database.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const shouldRun = process.env.VERCEL_ENV === "production" || process.env.MIGRATE_ON_BUILD === "1";

if (!shouldRun) {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] FATAL: production build with no DATABASE_URL set");
  process.exit(1);
}

console.log(`[migrate] applying migrations to ${new URL(url).host}`);

const client = postgres(url, { max: 1, prepare: false, ssl: "require" });

try {
  await migrate(drizzle(client), {
    migrationsFolder: "./drizzle",
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations",
  });
  console.log("[migrate] up to date");
} catch (err) {
  console.error("[migrate] FAILED — aborting build so the bad deploy never goes live");
  console.error(err);
  process.exit(1);
} finally {
  await client.end({ timeout: 5 });
}
