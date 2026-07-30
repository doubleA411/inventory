import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { buildBackup } from "@/lib/backup";
import { saveBackup, listBackups, deleteBackups } from "@/lib/storage";

export const maxDuration = 300;

const RETENTION_DAYS = 30;

/**
 * Daily scheduled backup (see vercel.json). Reads every org's full data via
 * buildBackup — the same function the manual Settings download uses — and
 * writes a dated JSON dump to the private backups bucket, then prunes
 * anything past the retention window for that org.
 *
 * Gated by CRON_SECRET: this endpoint reads every organization's business
 * data, so it must never be reachable without it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgs = await db.select({ id: organizations.id }).from(organizations);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const results = await Promise.all(
    orgs.map(async (org) => {
      try {
        const backup = await buildBackup(org.id);
        const filename = `${backup.meta.exportedAt.replace(/[:.]/g, "-")}.json`;
        await saveBackup(org.id, filename, JSON.stringify(backup));

        const existing = await listBackups(org.id);
        const stale = existing.filter((f) => f.createdAt < cutoff).map((f) => f.name);
        if (stale.length) await deleteBackups(org.id, stale);

        return { orgId: org.id, ok: true, pruned: stale.length };
      } catch (e) {
        return { orgId: org.id, ok: false, error: e instanceof Error ? e.message : "failed" };
      }
    }),
  );

  return NextResponse.json({ ranAt: new Date().toISOString(), results });
}
