import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, units, products, stockBatches, stockMovements } from "@/lib/db/schema";
import { createProduct, updateProduct } from "@/lib/products";
import { applyMovement } from "@/lib/stock";

describe("products (create/update)", () => {
  let orgId: string;
  let kgId: string;
  let gId: string;
  let litreId: string;
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db.select().from(organizations).limit(1);
    if (!org) throw new Error("No org — run `npm run db:seed` first.");
    orgId = org.id;
    const [kg] = await db
      .select()
      .from(units)
      .where(eq(units.organizationId, orgId))
      .limit(1);
    if (!kg) throw new Error("No units seeded for the test org.");
    kgId = kg.id;
    const [g] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, orgId), eq(units.symbol, "g")))
      .limit(1);
    const [kilogram] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, orgId), eq(units.symbol, "kg")))
      .limit(1);
    if (!g || !kilogram) throw new Error("Gram and kilogram units must be seeded for this test.");
    gId = g.id;
    kgId = kilogram.id;
    const [litre] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, orgId), eq(units.symbol, "L")))
      .limit(1);
    if (!litre) throw new Error("Litre unit must be seeded for this test.");
    litreId = litre.id;
  });

  afterAll(async () => {
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
  });

  it("creates a product with the given fields", async () => {
    const res = await createProduct(orgId, {
      name: `Test Rice ${Date.now()}`,
      code: `RICE-${Date.now()}`,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 5,
      costPrice: 45.5,
      notes: "Basmati",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      createdProductIds.push(res.id);
      const [row] = await db.select().from(products).where(eq(products.id, res.id));
      expect(row.name).toMatch(/^Test Rice/);
      expect(Number(row.reorderLevel)).toBe(5);
      expect(Number(row.costPrice)).toBe(45.5);
      expect(row.currentStock).toBe("0.000000");
    }
  });

  it("rejects a duplicate product code within the same org", async () => {
    const code = `DUP-${Date.now()}`;
    const first = await createProduct(orgId, {
      name: "First",
      code,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 0,
      costPrice: null,
      notes: null,
    });
    expect(first.ok).toBe(true);
    if (first.ok) createdProductIds.push(first.id);

    const second = await createProduct(orgId, {
      name: "Second",
      code,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 0,
      costPrice: null,
      notes: null,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already exists/i);
  });

  it("updates a product's fields", async () => {
    const created = await createProduct(orgId, {
      name: "Original Name",
      code: null,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 1,
      costPrice: null,
      notes: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.id);

    const updated = await updateProduct(orgId, created.id, {
      name: "Renamed Product",
      code: null,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 20,
      costPrice: 12,
      notes: "updated",
    });
    expect(updated.ok).toBe(true);

    const [row] = await db.select().from(products).where(eq(products.id, created.id));
    expect(row.name).toBe("Renamed Product");
    expect(Number(row.reorderLevel)).toBe(20);
    expect(Number(row.costPrice)).toBe(12);
  });

  it("converts stock, reorder level, and costs when changing compatible stock units", async () => {
    const created = await createProduct(orgId, {
      name: "Convertible spice",
      code: `SPICE-${Date.now()}`,
      categoryId: null,
      stockUnitId: gId,
      reorderLevel: 500,
      costPrice: 10,
      notes: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.id);

    await applyMovement({
      organizationId: orgId,
      productId: created.id,
      type: "restock",
      quantity: 2500,
      unitId: gId,
      unitCost: 10,
    });

    const updated = await updateProduct(orgId, created.id, {
      name: "Convertible spice",
      code: created.id,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 500,
      costPrice: 10,
      notes: null,
    });
    expect(updated.ok).toBe(true);

    const [product] = await db.select().from(products).where(eq(products.id, created.id));
    const [batch] = await db.select().from(stockBatches).where(eq(stockBatches.productId, created.id));
    const [movement] = await db.select().from(stockMovements).where(eq(stockMovements.productId, created.id));
    expect(Number(product.currentStock)).toBe(2.5);
    expect(Number(product.reorderLevel)).toBe(0.5);
    expect(Number(product.costPrice)).toBe(10_000);
    expect(Number(batch.quantityRemaining)).toBe(2.5);
    expect(Number(batch.unitCost)).toBe(10_000);
    expect(Number(movement.deltaInStockUnit)).toBe(2.5);
    expect(Number(movement.balanceAfter)).toBe(2.5);
  });

  it("rejects a stock unit change across incompatible unit types", async () => {
    const created = await createProduct(orgId, {
      name: "Non-convertible stock",
      code: `NONCONVERT-${Date.now()}`,
      categoryId: null,
      stockUnitId: gId,
      reorderLevel: 500,
      costPrice: 10,
      notes: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.id);

    const updated = await updateProduct(orgId, created.id, {
      name: "Non-convertible stock",
      code: `NONCONVERT-CHANGED-${Date.now()}`,
      categoryId: null,
      stockUnitId: litreId,
      reorderLevel: 500,
      costPrice: 10,
      notes: null,
    });
    expect(updated).toEqual(expect.objectContaining({ ok: false }));
    if (!updated.ok) expect(updated.error).toMatch(/different unit types/i);

    const [product] = await db.select().from(products).where(eq(products.id, created.id));
    expect(product.stockUnitId).toBe(gId);
  });

  it("does not update a product belonging to a different organization", async () => {
    const created = await createProduct(orgId, {
      name: "Org Scoped",
      code: null,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 0,
      costPrice: null,
      notes: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdProductIds.push(created.id);

    const fakeOrgId = "00000000-0000-0000-0000-000000000000";
    await updateProduct(fakeOrgId, created.id, {
      name: "Hijacked",
      code: null,
      categoryId: null,
      stockUnitId: kgId,
      reorderLevel: 0,
      costPrice: null,
      notes: null,
    });

    const [row] = await db.select().from(products).where(eq(products.id, created.id));
    expect(row.name).toBe("Org Scoped"); // unchanged
  });
});
