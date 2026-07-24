import { config } from "dotenv";
config({ path: ".env.local" });
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL!;
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])/.test(url);

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
