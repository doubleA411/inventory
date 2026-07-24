import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
}

// Local Postgres (Docker) has no SSL; hosted databases (Supabase, Neon…) require it.
export const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(connectionString);

// Reuse the client across HMR reloads in dev to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(connectionString, {
    max: 10,
    prepare: false, // required for Supabase's transaction pooler
    ssl: isLocalDb ? false : "require",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
export type Database = typeof db;
