"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, categories, units } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { applyMovement } from "@/lib/stock";

export type ImportRow = {
  name?: string;
  code?: string;
  category?: string;
  unit?: string;
  openingStock?: string | number;
  reorderLevel?: string | number;
  expiryDate?: string;
  costPrice?: string | number;
};

export type ImportResult = {
  inserted: number;
  errors: { row: number; message: string }[];
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function importProductsAction(
  rows: ImportRow[],
): Promise<ImportResult> {
  const { organization, user } = await requireRole("admin");
  const orgId = organization.id;

  // Build lookup maps for units and categories.
  const unitList = await db
    .select()
    .from(units)
    .where(eq(units.organizationId, orgId));
  const unitBySymbol = new Map(unitList.map((u) => [u.symbol.toLowerCase(), u]));
  const unitByName = new Map(unitList.map((u) => [u.name.toLowerCase(), u]));

  const catList = await db
    .select()
    .from(categories)
    .where(eq(categories.organizationId, orgId));
  const catByName = new Map(catList.map((c) => [c.name.toLowerCase(), c]));

  const errors: ImportResult["errors"] = [];
  let inserted = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;
    const name = (r.name ?? "").toString().trim();
    if (!name) {
      errors.push({ row: rowNum, message: "Missing product name" });
      continue;
    }
    const unitKey = (r.unit ?? "").toString().trim().toLowerCase();
    const unit = unitBySymbol.get(unitKey) ?? unitByName.get(unitKey);
    if (!unit) {
      errors.push({
        row: rowNum,
        message: `Unknown unit "${r.unit ?? ""}". Add it under Units first.`,
      });
      continue;
    }

    // Resolve or create category.
    let categoryId: string | null = null;
    const catName = (r.category ?? "").toString().trim();
    if (catName) {
      const existing = catByName.get(catName.toLowerCase());
      if (existing) {
        categoryId = existing.id;
      } else {
        const [c] = await db
          .insert(categories)
          .values({ organizationId: orgId, name: catName })
          .returning();
        catByName.set(catName.toLowerCase(), c);
        categoryId = c.id;
      }
    }

    const reorder = num(r.reorderLevel) ?? 0;
    const cost = num(r.costPrice);
    const opening = num(r.openingStock) ?? 0;

    try {
      const [product] = await db
        .insert(products)
        .values({
          organizationId: orgId,
          name,
          code: r.code?.toString().trim() || null,
          categoryId,
          stockUnitId: unit.id,
          reorderLevel: String(reorder),
          costPrice: cost != null ? String(cost) : null,
        })
        .returning();

      if (opening > 0) {
        const expiry = (r.expiryDate ?? "").toString().trim() || null;
        const res = await applyMovement({
          organizationId: orgId,
          productId: product.id,
          type: "restock",
          quantity: opening,
          unitId: unit.id,
          userId: user.id,
          note: "Opening stock (import)",
          expiryDate: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
        });
        if (!res.ok) {
          errors.push({ row: rowNum, message: `Stock: ${res.error}` });
        }
      }
      inserted++;
    } catch (e) {
      if (e instanceof Error && e.message.includes("products_org_code_uq")) {
        errors.push({ row: rowNum, message: `Duplicate code "${r.code}"` });
      } else {
        errors.push({ row: rowNum, message: "Could not insert row" });
      }
    }
  }

  revalidatePath("/products");
  revalidatePath("/dashboard");
  return { inserted, errors };
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
