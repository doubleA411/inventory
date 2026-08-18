import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

const url = process.env.DATABASE_URL;
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);
const sql = postgres(url, { ssl: isLocalDb ? false : "require" });

const hash = "90c055155acb428ad91a9cc36bb7d5cbf300ff0a85336a19d393d468ea2e5897";
const createdAt = 1786452746593; // matches journal "when" for 0021_gifted_ozymandias

const existing = await sql`select id from drizzle.__drizzle_migrations where hash = ${hash}`;
if (existing.length > 0) {
  console.log("Already recorded:", existing);
} else {
  const result = await sql`
    insert into drizzle.__drizzle_migrations (hash, created_at)
    values (${hash}, ${createdAt})
    returning id, hash, created_at
  `;
  console.log("Inserted:", result);
}

await sql.end();
