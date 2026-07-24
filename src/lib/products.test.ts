import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, units, products } from "@/lib/db/schema";
import { createProduct, updateProduct } from "@/lib/products";

describe("products (create/update)", () => {
  let orgId: string;
  let kgId: string;
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
