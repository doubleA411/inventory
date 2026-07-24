import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, categories, units } from "@/lib/db/schema";
import { applyMovement } from "@/lib/stock";
import { isUniqueViolation } from "@/lib/db-errors";

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

// How many rows to insert concurrently. Each row does several DB round trips
// (product insert + the stock-movement transaction), which are latency-bound
// rather than CPU-bound — running them one-at-a-time means every row pays a
// full network round trip in sequence. A modest concurrency limit lets rows
// overlap in flight without overwhelming the connection pool.
const IMPORT_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function importProducts(
  orgId: string,
  userId: string,
  rows: ImportRow[],
): Promise<ImportResult> {
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

  // Pre-create any brand-new categories referenced in the file *before*
  // processing rows concurrently below — otherwise two rows in the same
  // concurrent batch that both reference the same new category would race
  // to insert it.
  const newCatNames = new Set<string>();
  for (const r of rows) {
    const catName = (r.category ?? "").toString().trim();
    if (catName && !catByName.has(catName.toLowerCase())) {
      newCatNames.add(catName);
    }
  }
  for (const catName of newCatNames) {
    // Re-check in case an identically-cased duplicate already resolved it.
    if (catByName.has(catName.toLowerCase())) continue;
    const [c] = await db
      .insert(categories)
      .values({ organizationId: orgId, name: catName })
      .returning();
    catByName.set(catName.toLowerCase(), c);
  }

  const errors: ImportResult["errors"] = [];
  let inserted = 0;

  await mapWithConcurrency(rows, IMPORT_CONCURRENCY, async (r, i) => {
    const rowNum = i + 1;
    const name = (r.name ?? "").toString().trim();
    if (!name) {
      errors.push({ row: rowNum, message: "Missing product name" });
      return;
    }
    const unitKey = (r.unit ?? "").toString().trim().toLowerCase();
    const unit = unitBySymbol.get(unitKey) ?? unitByName.get(unitKey);
    if (!unit) {
      errors.push({
        row: rowNum,
        message: `Unknown unit "${r.unit ?? ""}". Add it under Units first.`,
      });
      return;
    }

    const catName = (r.category ?? "").toString().trim();
    const categoryId = catName ? catByName.get(catName.toLowerCase())?.id ?? null : null;

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
          userId,
          note: "Opening stock (import)",
          expiryDate: expiry && /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
        });
        if (!res.ok) {
          errors.push({ row: rowNum, message: `Stock: ${res.error}` });
        }
      }
      inserted++;
    } catch (e) {
      if (isUniqueViolation(e, "products_org_code_uq")) {
        errors.push({ row: rowNum, message: `Duplicate code "${r.code}"` });
      } else {
        errors.push({ row: rowNum, message: "Could not insert row" });
      }
    }
  });

  return { inserted, errors };
}
