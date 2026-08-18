import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { findSchemaDrift } from "@/lib/db/drift";

// Lightweight health check. Also used by a daily Vercel Cron to keep the
// Supabase free-tier database from pausing after inactivity, and to catch
// schema drift (a migration that never reached production) before a user
// hits it as a 500 on every authenticated page.
export async function GET() {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }

  const drift = await findSchemaDrift();
  if (drift.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        db: "up",
        schema: "drift",
        detail: "schema.ts declares columns/enum values the database lacks — run migrations",
        missing: drift,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    db: "up",
    schema: "in-sync",
    ts: new Date().toISOString(),
  });
}
