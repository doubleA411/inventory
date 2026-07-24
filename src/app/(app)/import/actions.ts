"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { units } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { importProducts, type ImportRow, type ImportResult } from "@/lib/import-products";

export async function importProductsAction(
  rows: ImportRow[],
): Promise<ImportResult> {
  const { organization, user } = await requireRole("admin");
  const result = await importProducts(organization.id, user.id, rows);
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
