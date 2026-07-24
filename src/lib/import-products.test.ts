import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, users, products, categories, stockBatches } from "@/lib/db/schema";
import { importProducts } from "@/lib/import-products";

describe("importProducts (CSV/XLSX import)", () => {
  let orgId: string;
  let userId: string;
  const createdProductIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const run = Date.now();

  beforeAll(async () => {
    const [org] = await db.select().from(organizations).limit(1);
    if (!org) throw new Error("No org — run `npm run db:seed` first.");
    orgId = org.id;
    const [user] = await db.select().from(users).limit(1);
    if (!user) throw new Error("No user — run `npm run db:seed` first.");
    userId = user.id;
  });

  afterAll(async () => {
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdCategoryIds.length) {
      await db.delete(categories).where(inArray(categories.id, createdCategoryIds));
    }
  });

  async function trackAndFind(name: string) {
    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.organizationId, orgId), eq(products.name, name)));
    if (row) createdProductIds.push(row.id);
    return row;
  }

  it("imports a valid row, creating an opening-stock batch", async () => {
    const name = `Import Onion ${run}`;
    const result = await importProducts(orgId, userId, [
      { name, unit: "kg", openingStock: 25, reorderLevel: 5, costPrice: 30 },
    ]);
    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(0);

    const row = await trackAndFind(name);
    expect(row).toBeTruthy();
    expect(Number(row.currentStock)).toBe(25);

    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.productId, row.id));
    expect(batches).toHaveLength(1);
    expect(Number(batches[0].quantityRemaining)).toBe(25);
  });

  it("matches units by symbol or full name, case-insensitively", async () => {
    const name = `Import Rice ${run}`;
    const result = await importProducts(orgId, userId, [
      { name, unit: "KILOGRAM" }, // full name, different case
    ]);
    expect(result.errors).toHaveLength(0);
    expect(result.inserted).toBe(1);
    await trackAndFind(name);
  });

  it("auto-creates a category referenced by name", async () => {
    const name = `Import Spice ${run}`;
    const categoryName = `Test Category ${run}`;
    const result = await importProducts(orgId, userId, [
      { name, unit: "kg", category: categoryName },
    ]);
    expect(result.inserted).toBe(1);

    const row = await trackAndFind(name);
    expect(row.categoryId).toBeTruthy();
    const [cat] = await db.select().from(categories).where(eq(categories.id, row.categoryId!));
    expect(cat.name).toBe(categoryName);
    createdCategoryIds.push(cat.id);
  });

  it("reuses an existing category on a second row instead of duplicating it", async () => {
    const categoryName = `Shared Category ${run}`;
    const nameA = `Import A ${run}`;
    const nameB = `Import B ${run}`;
    const result = await importProducts(orgId, userId, [
      { name: nameA, unit: "kg", category: categoryName },
      { name: nameB, unit: "kg", category: categoryName },
    ]);
    expect(result.inserted).toBe(2);

    const rowA = await trackAndFind(nameA);
    const rowB = await trackAndFind(nameB);
    expect(rowA.categoryId).toBe(rowB.categoryId);
    if (rowA.categoryId) createdCategoryIds.push(rowA.categoryId);
  });

  it("errors a row with a missing product name", async () => {
    const result = await importProducts(orgId, userId, [{ unit: "kg" }]);
    expect(result.inserted).toBe(0);
    expect(result.errors[0].message).toMatch(/missing product name/i);
  });

  it("errors a row with an unknown unit", async () => {
    const result = await importProducts(orgId, userId, [
      { name: `Import Unknown Unit ${run}`, unit: "furlong" },
    ]);
    expect(result.inserted).toBe(0);
    expect(result.errors[0].message).toMatch(/unknown unit/i);
  });

  it("errors a row with a duplicate product code, but still imports the rest", async () => {
    const code = `IMPCODE-${run}`;
    const nameFirst = `Import Dup First ${run}`;
    const nameSecond = `Import Dup Second ${run}`;
    const nameThird = `Import Dup Third ${run}`;

    const first = await importProducts(orgId, userId, [
      { name: nameFirst, unit: "kg", code },
    ]);
    expect(first.inserted).toBe(1);
    await trackAndFind(nameFirst);

    const result = await importProducts(orgId, userId, [
      { name: nameSecond, unit: "kg", code }, // duplicate code -> should error
      { name: nameThird, unit: "kg" }, // no code -> should still succeed
    ]);
    expect(result.inserted).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toMatch(/duplicate code/i);
    await trackAndFind(nameThird);
  });

  it("does not create a batch when opening stock is zero or omitted", async () => {
    const name = `Import No Stock ${run}`;
    const result = await importProducts(orgId, userId, [{ name, unit: "kg" }]);
    expect(result.inserted).toBe(1);
    const row = await trackAndFind(name);
    expect(Number(row.currentStock)).toBe(0);
    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.productId, row.id));
    expect(batches).toHaveLength(0);
  });
});
