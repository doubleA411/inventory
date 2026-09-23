import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { findSchemaDrift } from "@/lib/db/drift";
import { hasCronSecret } from "@/lib/cron-auth";

/**
 * Lightweight health check. Also used by a daily Vercel Cron to keep the
 * Supabase free-tier database from pausing after inactivity, and to catch
 * schema drift (a migration that never reached production) before a user
 * hits it as a 500 on every authenticated page.
 *
 * The endpoint stays public — uptime checks and the platform's own probes
 * need it, and "is this up" is not a secret. What drifted *is*: the list
 * names live table and column names, which is a free map of the schema for
 * anyone poking at the app. Callers presenting CRON_SECRET (the daily cron,
 * and anyone debugging by hand) get the full list; everyone else gets the
 * same 503 with a count, which is all a monitor needs to alert on.
 */
export async function GET(req: NextRequest) {
  try {
    await db.execute(sql`select 1`);
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }

  // Bounded, so a stuck connection shows up as a failed check instead of a
  // request that hangs until the platform kills it.
  let drift;
  try {
    drift = await Promise.race([
      findSchemaDrift(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("schema check timed out")), 10_000),
      ),
    ]);
  } catch (e) {
    console.error("[health] schema check failed", e);
    return NextResponse.json({ ok: false, db: "up", schema: "unknown" }, { status: 503 });
  }
  if (drift.length > 0) {
    const trusted = hasCronSecret(req.headers.get("authorization"));
    return NextResponse.json(
      {
        ok: false,
        db: "up",
        schema: "drift",
        detail:
          "schema.ts declares columns/enum values the database lacks — run migrations",
        missingCount: drift.length,
        ...(trusted ? { missing: drift } : {}),
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
