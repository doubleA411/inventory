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
