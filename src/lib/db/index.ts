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
    // Each serverless instance holds its own pool, so a large `max` multiplies
    // across warm instances and exhausts the hosted pooler's client limit
    // (Supabase's session pooler allows only 15 in total). Local Postgres has
    // no such ceiling and benefits from real parallelism.
    max: isLocalDb ? 10 : 1,
    prepare: false, // required for Supabase's transaction pooler
    ssl: isLocalDb ? false : "require",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });
export { schema };
export type Database = typeof db;
