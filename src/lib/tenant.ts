import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  categories,
  customers,
  expenseCategories,
  invoices,
  products,
  quotations,
  units,
  vendors,
} from "@/lib/db/schema";

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Tenant isolation for referenced records.
 *
 * Foreign keys are single-column, so the database happily accepts an invoice
 * whose customerId points at another organization's customer. Every list page
 * then joins on that id and prints the other business's data. Any id that
 * arrives from a client and is stored on a record must pass through here
 * first: it has to belong to the caller's organization.
 *
 * Archived records still count as the caller's own — editing an old invoice
 * whose customer was later archived must keep working.
 */
type Ref = { table: PgTable; id: PgColumn; org: PgColumn; label: string };
const REFS = {
  customer: { table: customers, id: customers.id, org: customers.organizationId, label: "customer" },
  vendor: { table: vendors, id: vendors.id, org: vendors.organizationId, label: "vendor" },
  product: { table: products, id: products.id, org: products.organizationId, label: "product" },
  quotation: { table: quotations, id: quotations.id, org: quotations.organizationId, label: "quotation" },
  invoice: { table: invoices, id: invoices.id, org: invoices.organizationId, label: "invoice" },
  category: { table: categories, id: categories.id, org: categories.organizationId, label: "category" },
  unit: { table: units, id: units.id, org: units.organizationId, label: "unit" },
  expenseCategory: { table: expenseCategories, id: expenseCategories.id, org: expenseCategories.organizationId, label: "expense category" },
} satisfies Record<string, Ref>;

export type RefKind = keyof typeof REFS;
type RefValue = string | null | undefined | (string | null | undefined)[];

/**
 * Returns an error message naming the first referenced record that doesn't
 * belong to `orgId`, or null when every given id is the caller's own. Null,
 * undefined and empty ids are skipped — "no customer" is always allowed.
 */
export async function foreignRefError(
  orgId: string,
  refs: Partial<Record<RefKind, RefValue>>,
  client: DbClient = db,
): Promise<string | null> {
  for (const [kind, value] of Object.entries(refs) as [RefKind, RefValue][]) {
    const ids = [...new Set((Array.isArray(value) ? value : [value]).filter((v): v is string => !!v))];
    if (!ids.length) continue;
    const ref: Ref = REFS[kind];
    const rows = await client
      .select({ id: ref.id })
      .from(ref.table)
      .where(and(inArray(ref.id, ids), eq(ref.org, orgId)));
    if (rows.length !== ids.length) return `That ${ref.label} no longer exists.`;
  }
  return null;
}
