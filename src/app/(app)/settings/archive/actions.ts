"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  expenses,
  invoices,
  products,
  purchaseBills,
  purchaseLists,
  quotations,
  vendors,
} from "@/lib/db/schema";
import { archiveKinds, type ArchiveKind } from "@/lib/archive";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

const tables = {
  product: products,
  customer: customers,
  vendor: vendors,
  expense: expenses,
  quotation: quotations,
  invoice: invoices,
  purchase_bill: purchaseBills,
  purchase_list: purchaseLists,
} as const;

export async function restoreArchivedRecord(kind: ArchiveKind, id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  if (!archiveKinds.includes(kind)) return;

  const table = tables[kind];
  await db
    .update(table)
    .set({ deletedAt: null, deletedBy: null })
    .where(and(eq(table.id, id), eq(table.organizationId, organization.id)));
  await recordAudit({
    orgId: organization.id,
    action: `${kind}.restored`,
    entityType: kind,
    entityId: id,
    summary: "Restored from archive",
    actorUserId: user.id,
  });

  revalidatePath("/settings/archive");
  revalidatePath("/dashboard");
  revalidatePath("/products");
  revalidatePath("/customers");
  revalidatePath("/vendors");
  revalidatePath("/expenses");
  revalidatePath("/quotations");
  revalidatePath("/invoices");
  revalidatePath("/purchase-lists");
}

