import "server-only";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog, users, type ActivityAction } from "@/lib/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Append one entry to the activity log.
 *
 * Takes an optional transaction so a reversal and its log entry commit or roll
 * back together — a log that can outlive a rolled-back reversal is worse than
 * no log, because it accuses someone of something that never happened.
 *
 * userName is denormalised on purpose: users.id is set null when a staff
 * member is removed, and "someone reversed ₹25,000" is not a useful audit
 * trail. The name recorded here is the one they had at the time.
 */
export async function logActivity(
  client: Tx | typeof db,
  entry: {
    orgId: string;
    action: ActivityAction;
    entityType: string;
    entityId?: string | null;
    invoiceId?: string | null;
    vendorId?: string | null;
    amount?: number | null;
    summary: string;
    userId?: string | null;
    userName?: string | null;
  },
): Promise<void> {
  await client.insert(activityLog).values({
    organizationId: entry.orgId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    invoiceId: entry.invoiceId ?? null,
    vendorId: entry.vendorId ?? null,
    amount: entry.amount != null ? String(entry.amount) : null,
    summary: entry.summary,
    userId: entry.userId ?? null,
    userName: entry.userName ?? null,
  });
}

/** Look up a display name for the acting user, for the log's userName column. */
export async function actorName(client: Tx | typeof db, userId: string): Promise<string | null> {
  const [u] = await client
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.name ?? null;
}

/** Entries against one invoice, newest first — shown under its payment history. */
export async function invoiceActivity(orgId: string, invoiceId: string) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.organizationId, orgId), eq(activityLog.invoiceId, invoiceId)))
    .orderBy(desc(activityLog.createdAt));
}

/** Entries against one vendor, newest first. */
export async function vendorActivity(orgId: string, vendorId: string) {
  return db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.organizationId, orgId), eq(activityLog.vendorId, vendorId)))
    .orderBy(desc(activityLog.createdAt));
}
