import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Which env file to load. Defaults to local dev so `npm run db:migrate` stays safe;
// `npm run db:migrate:prod` sets this to .env.production.local.
// NOTE: drizzle-kit only ever reads the file named here — a DATABASE_URL that is
// already exported in the shell will NOT override it.
const envFile = process.env.DRIZZLE_ENV ?? ".env.local";
config({ path: envFile, override: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(`DATABASE_URL missing — ${envFile} not found or has no DATABASE_URL`);
}

const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);

// `push` and `drop` change the schema WITHOUT writing a __drizzle_migrations
// row. That is exactly how 0021 drifted: prod's schema moved, the migration
// was never recorded, and the next `migrate` had no idea. Adding DRIZZLE_ENV
// made prod reachable, so make these physically impossible against it.
if (!isLocalDb && /\b(push|drop)\b/.test(process.argv.slice(2).join(" "))) {
  throw new Error(
    `refusing to run push/drop against a remote database (${new URL(url).host}).\n` +
      `Schema changes to production go through migrations:\n` +
      `  npm run db:generate   # writes a migration file\n` +
      `  npm run db:migrate:prod`,
  );
}

// Loud about the target so a prod migration is never a surprise.
console.log(
  `[drizzle] env=${envFile} host=${new URL(url).host} ${isLocalDb ? "(local)" : "*** REMOTE ***"}`,
);

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocalDb ? false : "require",
  },
  verbose: true,
  strict: true,
});
