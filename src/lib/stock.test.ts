import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, units, products } from "@/lib/db/schema";
import { convertQuantity } from "@/lib/units";
import { applyMovement } from "@/lib/stock";

// --- pure conversion tests (no DB) -----------------------------------------
describe("convertQuantity", () => {
  const kg = { groupId: "w", factorToBase: "1000", symbol: "kg" };
  const g = { groupId: "w", factorToBase: "1", symbol: "g" };
  const dozen = { groupId: "c", factorToBase: "12", symbol: "dz" };
  const pc = { groupId: "c", factorToBase: "1", symbol: "pc" };

  it("converts kg -> g", () => {
    expect(convertQuantity(2, kg, g)).toBe(2000);
  });
  it("converts g -> kg", () => {
    expect(convertQuantity(500, g, kg)).toBe(0.5);
  });
  it("converts dozen -> pieces", () => {
    expect(convertQuantity(3, dozen, pc)).toBe(36);
  });
  it("throws across unit groups", () => {
    expect(() => convertQuantity(1, kg, pc)).toThrow(/different unit types/i);
  });
});

// --- integration tests against the local DB --------------------------------
describe("applyMovement (FEFO + conversion + ledger)", () => {
  let orgId: string;
  let kgId: string;
  let gId: string;
  let litreId: string;
  let mlId: string;
  const createdProductIds: string[] = [];

  async function unitId(symbol: string): Promise<string> {
    const [u] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, orgId), eq(units.symbol, symbol)))
      .limit(1);
    if (!u) throw new Error(`Unit ${symbol} not found — did you seed?`);
    return u.id;
  }

  async function makeProduct(code: string, stockUnitId: string): Promise<string> {
    const [p] = await db
      .insert(products)
      .values({
        organizationId: orgId,
        name: `Test ${code}`,
        code,
        stockUnitId,
      })
      .returning();
    createdProductIds.push(p.id);
    return p.id;
  }

  beforeAll(async () => {
    const [org] = await db.select().from(organizations).limit(1);
    if (!org) throw new Error("No org — run `npm run db:seed` first.");
    orgId = org.id;
    kgId = await unitId("kg");
    gId = await unitId("g");
    litreId = await unitId("L");
    mlId = await unitId("ml");
  });

  afterAll(async () => {
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
  });

  it("restock adds stock and creates a batch balance", async () => {
    const pid = await makeProduct(`RS-${Date.now()}`, kgId);
    const r = await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 10,
      unitId: kgId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.balanceAfter).toBe(10);
  });

  it("converts across units: restock 2 L, use 500 ml -> 1.5 L", async () => {
    const pid = await makeProduct(`OIL-${Date.now()}`, litreId);
    await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 2,
      unitId: litreId,
    });
    const use = await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "usage",
      quantity: 500,
      unitId: mlId,
    });
    expect(use.ok).toBe(true);
    if (use.ok) expect(use.balanceAfter).toBe(1.5);
  });

  it("deducts FEFO: soonest-expiry batch first", async () => {
    const pid = await makeProduct(`ONION-${Date.now()}`, kgId);
    const today = "2026-07-22";
    const nextWeek = "2026-07-29";
    // Restock the LATER-expiry batch first to prove ordering is by expiry,
    // not insertion order.
    await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 5,
      unitId: kgId,
      expiryDate: nextWeek,
    });
    await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 5,
      unitId: kgId,
      expiryDate: today,
    });
    // Use 4 kg -> should come entirely from the `today` batch.
    const use = await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "usage",
      quantity: 4,
      unitId: kgId,
    });
    expect(use.ok).toBe(true);
    if (use.ok) expect(use.balanceAfter).toBe(6);

    // Verify the today batch has 1 left, nextWeek batch untouched at 5.
    const { stockBatches } = await import("@/lib/db/schema");
    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.productId, pid));
    const byExpiry = Object.fromEntries(
      batches.map((b) => [b.expiryDate, Number(b.quantityRemaining)]),
    );
    expect(byExpiry[today]).toBe(1);
    expect(byExpiry[nextWeek]).toBe(5);
  });

  it("blocks usage beyond available stock", async () => {
    const pid = await makeProduct(`SALT-${Date.now()}`, kgId);
    await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 2,
      unitId: kgId,
    });
    const use = await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "usage",
      quantity: 5,
      unitId: kgId,
    });
    expect(use.ok).toBe(false);
    if (!use.ok) expect(use.error).toMatch(/not enough stock/i);
  });

  it("adjustment decrease removes stock", async () => {
    const pid = await makeProduct(`ADJ-${Date.now()}`, kgId);
    await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "restock",
      quantity: 8,
      unitId: kgId,
    });
    const adj = await applyMovement({
      organizationId: orgId,
      productId: pid,
      type: "adjustment",
      quantity: 3,
      unitId: kgId,
      direction: "decrease",
      note: "physical count correction",
    });
    expect(adj.ok).toBe(true);
    if (adj.ok) expect(adj.balanceAfter).toBe(5);
  });
});
