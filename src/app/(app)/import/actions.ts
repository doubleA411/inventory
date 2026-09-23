"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { units, products } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { importProducts, type ImportRow, type ImportResult } from "@/lib/import-products";

export async function importProductsAction(
  rows: ImportRow[],
): Promise<ImportResult> {
  const { organization, user } = await requireRole("admin");
  const result = await importProducts(organization.id, user.id, rows);
  if (result.inserted > 0) {
    await recordAudit({
      orgId: organization.id,
      action: "product.imported",
      entityType: "product",
      entityLabel: `${result.inserted} products`,
      summary: `Imported ${result.inserted} product${result.inserted === 1 ? "" : "s"} from a spreadsheet`,
      details: { inserted: result.inserted, rows: rows.length, errors: result.errors.length },
      actorUserId: user.id,
    });
  }
  revalidatePath("/products");
  revalidatePath("/dashboard");
  return result;
}

// Small helper the client uses to know which units exist (for validation hints).
export async function getImportUnits(): Promise<
  { symbol: string; name: string }[]
> {
  const { organization } = await requireRole("admin");
  const list = await db
    .select({ symbol: units.symbol, name: units.name })
    .from(units)
    .where(eq(units.organizationId, organization.id));
  return list;
}

// Small helper the client uses to flag duplicate names in the preview,
// before the row even reaches the server-side import.
export async function getImportExistingNames(): Promise<string[]> {
  const { organization } = await requireRole("admin");
  const rows = await db
    .select({ name: products.name })
    .from(products)
    .where(eq(products.organizationId, organization.id));
  return rows.map((r) => r.name);
}
