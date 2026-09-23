import "server-only";

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  auditEvents,
  customers,
  expenseCategories,
  expenses,
  invoices,
  memberships,
  products,
  purchaseBills,
  purchaseLists,
  quotations,
  units,
  users,
  vendors,
} from "@/lib/db/schema";

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AuditInput = {
  orgId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Omit to have it looked up from entityType + entityId (document number, name…). */
  entityLabel?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  actorUserId?: string | null;
  actorName?: string | null;
};

// Where to find a human label for each entity type. Soft-deleted rows are
// deliberately not excluded — an archive event still wants the record's name.
type LabelSource = { table: PgTable; id: PgColumn; org: PgColumn; label: PgColumn };
const LABEL_SOURCES: Record<string, LabelSource> = {
  invoice: { table: invoices, id: invoices.id, org: invoices.organizationId, label: invoices.number },
  quotation: { table: quotations, id: quotations.id, org: quotations.organizationId, label: quotations.number },
  customer: { table: customers, id: customers.id, org: customers.organizationId, label: customers.name },
  vendor: { table: vendors, id: vendors.id, org: vendors.organizationId, label: vendors.name },
  product: { table: products, id: products.id, org: products.organizationId, label: products.name },
  expense: { table: expenses, id: expenses.id, org: expenses.organizationId, label: expenses.description },
  purchase_bill: { table: purchaseBills, id: purchaseBills.id, org: purchaseBills.organizationId, label: purchaseBills.number },
  purchase_list: { table: purchaseLists, id: purchaseLists.id, org: purchaseLists.organizationId, label: purchaseLists.number },
  expense_category: { table: expenseCategories, id: expenseCategories.id, org: expenseCategories.organizationId, label: expenseCategories.name },
  unit: { table: units, id: units.id, org: units.organizationId, label: units.symbol },
};

/** Look up the display label (document number, name) for a record. */
export async function auditLabel(
  client: DbClient,
  orgId: string,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  const source = LABEL_SOURCES[entityType];
  if (!source) return null;
  const [row] = await client
    .select({ label: source.label })
    .from(source.table)
    .where(and(eq(source.id, entityId), eq(source.org, orgId)))
    .limit(1);
  return (row?.label as string | undefined) ?? null;
}

/**
 * Write an immutable description of a material app action. Throws on failure —
 * use it inside the transaction that performs the change, so the event and the
 * change commit or roll back together.
 */
export async function writeAuditEvent(client: DbClient, entry: AuditInput): Promise<void> {
  let actorName = entry.actorName ?? null;
  if (!actorName && entry.actorUserId) {
    const [actor] = await client
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, entry.actorUserId))
      .limit(1);
    actorName = actor?.name ?? null;
  }
  let entityLabel = entry.entityLabel;
  if (entityLabel === undefined && entry.entityId) {
    entityLabel = await auditLabel(client, entry.orgId, entry.entityType, entry.entityId);
  }
  await client.insert(auditEvents).values({
    organizationId: entry.orgId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityLabel: entityLabel ?? null,
    summary: entry.summary,
    details: entry.details ?? null,
    actorUserId: entry.actorUserId ?? null,
    actorName,
  });
}

/**
 * Record an action that has already committed. Never throws: the change is
 * done, and failing the request now would tell the user it didn't happen and
 * invite a duplicate. A lost event is logged loudly instead.
 */
export async function recordAudit(entry: AuditInput): Promise<void> {
  try {
    await writeAuditEvent(db, entry);
  } catch (e) {
    console.error("[audit] failed to record event", entry.action, entry.entityId, e);
  }
}

/** Record an event in every organization the user belongs to (sign-in, password changes). */
export async function recordUserAudit(
  userId: string,
  entry: Omit<AuditInput, "orgId" | "entityType" | "entityId">,
): Promise<void> {
  try {
    const orgs = await db
      .select({ orgId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, userId));
    for (const { orgId } of orgs) {
      await writeAuditEvent(db, { ...entry, orgId, entityType: "user", entityId: userId });
    }
  } catch (e) {
    console.error("[audit] failed to record user event", entry.action, userId, e);
  }
}

export type AuditFilters = {
  q?: string;
  action?: string;
  entityType?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUDIT_PAGE_SIZE = 100;

/**
 * Filtered events, newest first. Date bounds are calendar days in the
 * organization's timezone, not UTC — "today" for an IST business starts at
 * 00:00 IST. Malformed URL params are ignored rather than reaching Postgres.
 */
export async function listAuditEvents(
  orgId: string,
  timeZone: string,
  filters: AuditFilters,
  page = 1,
) {
  const conditions: SQL[] = [eq(auditEvents.organizationId, orgId)];
  if (filters.action) conditions.push(eq(auditEvents.action, filters.action));
  if (filters.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
  if (filters.actorId && UUID_RE.test(filters.actorId)) {
    conditions.push(eq(auditEvents.actorUserId, filters.actorId));
  }
  const localDate = sql`(${auditEvents.createdAt} at time zone ${timeZone})::date`;
  if (filters.from && DATE_RE.test(filters.from)) conditions.push(sql`${localDate} >= ${filters.from}::date`);
  if (filters.to && DATE_RE.test(filters.to)) conditions.push(sql`${localDate} <= ${filters.to}::date`);
  if (filters.q?.trim()) {
    // Escape LIKE wildcards so "50%" searches for the literal text.
    const query = `%${filters.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    conditions.push(
      or(
        ilike(auditEvents.summary, query),
        ilike(auditEvents.entityLabel, query),
        ilike(auditEvents.actorName, query),
        ilike(auditEvents.action, query),
        sql`coalesce(${auditEvents.details}::text, '') ilike ${query}`,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(AUDIT_PAGE_SIZE + 1)
    .offset((Math.max(1, page) - 1) * AUDIT_PAGE_SIZE);
  return { events: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}

export async function auditFilterOptions(orgId: string) {
  const [actions, entityTypes, actors] = await Promise.all([
    db
      .selectDistinct({ value: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, orgId))
      .orderBy(asc(auditEvents.action)),
    db
      .selectDistinct({ value: auditEvents.entityType })
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, orgId))
      .orderBy(asc(auditEvents.entityType)),
    db
      .selectDistinct({ id: auditEvents.actorUserId, name: auditEvents.actorName })
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, orgId))
      .orderBy(asc(auditEvents.actorName)),
  ]);
  // A renamed user shows up once per name they've acted under; keep the first.
  const seen = new Set<string>();
  const uniqueActors = actors.filter((a) => a.id && !seen.has(a.id) && seen.add(a.id));
  return { actions, entityTypes, actors: uniqueActors };
}
