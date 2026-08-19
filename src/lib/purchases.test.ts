import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  units,
  users,
  products,
  vendors,
  stockBatches,
  stockMovements,
  purchaseBills,
  purchaseBillItems,
  purchaseBillPayments,
  type Organization,
} from "@/lib/db/schema";
import { applyMovement } from "@/lib/stock";
import {
  createPurchaseBillCore,
  removePurchaseBillItemCore,
  recordVendorPaymentCore,
  reverseVendorPaymentCore,
} from "@/lib/purchases";

describe("removePurchaseBillItemCore", () => {
  let org: Organization;
  let userId: string;
  let kgId: string;
  let vendorId: string;
  const createdVendorIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdBillIds: string[] = [];

  async function makeProduct(): Promise<string> {
    const [p] = await db
      .insert(products)
      .values({
        organizationId: org.id,
        name: `Test PB ${Date.now()}-${createdProductIds.length}`,
        stockUnitId: kgId,
      })
      .returning();
    createdProductIds.push(p.id);
    return p.id;
  }

  async function makeVendor(): Promise<string> {
    const [v] = await db
      .insert(vendors)
      .values({ organizationId: org.id, name: `Test Vendor ${Date.now()}-${createdVendorIds.length}` })
      .returning();
    createdVendorIds.push(v.id);
    return v.id;
  }

  /** A bill with one 5 kg @ 100 product line, plus an optional charge line. */
  async function makeBill(productId: string, charge?: number, forVendor = vendorId) {
    const result = await createPurchaseBillCore(org, userId, {
      vendorId: forVendor,
      billDate: new Date().toISOString().slice(0, 10),
      items: [
        {
          kind: "product",
          productId,
          description: "Test line",
          quantity: 5,
          unitId: kgId,
          unit: "kg",
          rate: 100,
        },
        ...(charge
          ? [{ kind: "charge" as const, description: "Delivery", amount: charge }]
          : []),
      ],
    });
    if (!result.ok) throw new Error(result.error);
    createdBillIds.push(result.id);
    const items = await db
      .select()
      .from(purchaseBillItems)
      .where(eq(purchaseBillItems.purchaseBillId, result.id));
    return { billId: result.id, items };
  }

  async function stockOf(productId: string): Promise<number> {
    const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    return Number(p.currentStock);
  }

  beforeAll(async () => {
    // The dev database holds a real business alongside the demo org — always
    // scope to the demo org so tests can never touch real records.
    const [found] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Sample Caterers"))
      .limit(1);
    if (!found) throw new Error('No "Sample Caterers" org — run `npm run db:seed` first.');
    org = found;
    const [u] = await db.select().from(users).limit(1);
    if (!u) throw new Error("No users — run `npm run db:seed` first.");
    userId = u.id;
    const [kg] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, org.id), eq(units.symbol, "kg")))
      .limit(1);
    if (!kg) throw new Error("No kg unit — run `npm run db:seed` first.");
    kgId = kg.id;
    vendorId = await makeVendor();
  });

  afterAll(async () => {
    if (createdBillIds.length) {
      await db.delete(purchaseBills).where(inArray(purchaseBills.id, createdBillIds));
    }
    await db
      .delete(purchaseBillPayments)
      .where(inArray(purchaseBillPayments.vendorId, createdVendorIds));
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    await db.delete(vendors).where(inArray(vendors.id, createdVendorIds));
  });

  it("unlink drops the line but leaves the stock in inventory", async () => {
    const productId = await makeProduct();
    const { billId, items } = await makeBill(productId, 50);
    const line = items.find((i) => i.productId === productId)!;

    const result = await removePurchaseBillItemCore(org.id, billId, line.id, "unlink");
    expect(result).toEqual({ ok: true });

    expect(await stockOf(productId)).toBe(5);
    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.productId, productId));
    expect(batches).toHaveLength(1);
    expect(batches[0].purchaseBillItemId).toBeNull();

    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.total)).toBe(50); // only the delivery charge is left
  });

  it("delete_restock removes the batch and its movement", async () => {
    const productId = await makeProduct();
    const { billId, items } = await makeBill(productId, 50);
    const line = items.find((i) => i.productId === productId)!;

    const result = await removePurchaseBillItemCore(org.id, billId, line.id, "delete_restock");
    expect(result).toEqual({ ok: true });

    expect(await stockOf(productId)).toBe(0);
    const batches = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.productId, productId));
    expect(batches).toHaveLength(0);
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.productId, productId));
    expect(movements).toHaveLength(0);

    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.total)).toBe(50);
  });

  it("refuses to delete a restock that has already been partly used", async () => {
    const productId = await makeProduct();
    const { billId, items } = await makeBill(productId);
    const line = items[0];
    const used = await applyMovement({
      organizationId: org.id,
      productId,
      type: "usage",
      quantity: 2,
      unitId: kgId,
    });
    expect(used.ok).toBe(true);

    const result = await removePurchaseBillItemCore(org.id, billId, line.id, "delete_restock");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/partly used/i);

    // Nothing moved: the line is still billed and the remaining stock is intact.
    expect(await stockOf(productId)).toBe(3);
    const still = await db
      .select()
      .from(purchaseBillItems)
      .where(eq(purchaseBillItems.id, line.id));
    expect(still).toHaveLength(1);
  });

  it("turns a payment that no longer fits into an unassigned vendor credit", async () => {
    // Its own vendor: recordVendorPaymentCore spreads a payment across every
    // open bill the vendor has, and the other tests leave some behind.
    const payeeId = await makeVendor();
    const productId = await makeProduct();
    const { billId, items } = await makeBill(productId, 50, payeeId); // 550 total
    const line = items.find((i) => i.productId === productId)!;
    const paid = await recordVendorPaymentCore(org.id, userId, {
      vendorId: payeeId,
      amount: 550,
      method: "cash",
    });
    expect(paid.ok).toBe(true);

    const result = await removePurchaseBillItemCore(org.id, billId, line.id, "unlink");
    expect(result).toEqual({ ok: true });

    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.total)).toBe(50);
    expect(Number(bill.amountPaid)).toBe(50); // no negative due left on the bill

    const credits = await db
      .select()
      .from(purchaseBillPayments)
      .where(
        and(
          eq(purchaseBillPayments.vendorId, payeeId),
          isNull(purchaseBillPayments.purchaseBillId),
        ),
      );
    expect(credits.reduce((s, c) => s + Number(c.amount), 0)).toBe(500);
  });
});

describe("reverseVendorPaymentCore", () => {
  let org: Organization;
  let userId: string;
  let kgId: string;
  const createdVendorIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdBillIds: string[] = [];

  async function makeVendor(openingBalance = 0): Promise<string> {
    const [v] = await db
      .insert(vendors)
      .values({
        organizationId: org.id,
        name: `Test Payee ${Date.now()}-${createdVendorIds.length}`,
        openingBalance: String(openingBalance),
      })
      .returning();
    createdVendorIds.push(v.id);
    return v.id;
  }

  /** A bill for `amount` as a product line, plus an optional charge line. */
  async function makeBill(vendorId: string, amount: number, charge?: number): Promise<string> {
    const [p] = await db
      .insert(products)
      .values({
        organizationId: org.id,
        name: `Test Pay ${Date.now()}-${createdProductIds.length}`,
        stockUnitId: kgId,
      })
      .returning();
    createdProductIds.push(p.id);
    const result = await createPurchaseBillCore(org, userId, {
      vendorId,
      billDate: new Date().toISOString().slice(0, 10),
      items: [
        {
          kind: "product",
          productId: p.id,
          description: "Test line",
          quantity: 1,
          unitId: kgId,
          unit: "kg",
          rate: amount,
        },
        ...(charge ? [{ kind: "charge" as const, description: "Delivery", amount: charge }] : []),
      ],
    });
    if (!result.ok) throw new Error(result.error);
    createdBillIds.push(result.id);
    return result.id;
  }

  async function paymentsFor(vendorId: string) {
    return db
      .select()
      .from(purchaseBillPayments)
      .where(eq(purchaseBillPayments.vendorId, vendorId));
  }

  beforeAll(async () => {
    const [found] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.name, "Sample Caterers"))
      .limit(1);
    if (!found) throw new Error('No "Sample Caterers" org — run `npm run db:seed` first.');
    org = found;
    const [u] = await db.select().from(users).limit(1);
    userId = u.id;
    const [kg] = await db
      .select()
      .from(units)
      .where(and(eq(units.organizationId, org.id), eq(units.symbol, "kg")))
      .limit(1);
    kgId = kg.id;
  });

  afterAll(async () => {
    if (createdBillIds.length) {
      await db.delete(purchaseBills).where(inArray(purchaseBills.id, createdBillIds));
    }
    if (createdVendorIds.length) {
      await db
        .delete(purchaseBillPayments)
        .where(inArray(purchaseBillPayments.vendorId, createdVendorIds));
    }
    if (createdProductIds.length) {
      await db.delete(products).where(inArray(products.id, createdProductIds));
    }
    if (createdVendorIds.length) {
      await db.delete(vendors).where(inArray(vendors.id, createdVendorIds));
    }
  });

  it("puts the bill back to due", async () => {
    const vendorId = await makeVendor();
    const billId = await makeBill(vendorId, 300);
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 300, method: "cash" });

    const [row] = await paymentsFor(vendorId);
    const result = await reverseVendorPaymentCore(org.id, row.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(300);

    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.amountPaid)).toBe(0);
    expect(await paymentsFor(vendorId)).toHaveLength(0);
  });

  it("reverses the whole recording when one payment was split across bills", async () => {
    const vendorId = await makeVendor();
    const firstId = await makeBill(vendorId, 200);
    const secondId = await makeBill(vendorId, 400);
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 600, method: "upi" });

    const rows = await paymentsFor(vendorId);
    expect(rows).toHaveLength(2); // one chunk per bill

    // Clicking either row takes the whole ₹600 back off.
    const result = await reverseVendorPaymentCore(org.id, rows[0].id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amount).toBe(600);
      expect(result.rows).toBe(2);
    }

    const bills = await db
      .select()
      .from(purchaseBills)
      .where(inArray(purchaseBills.id, [firstId, secondId]));
    expect(bills.map((b) => Number(b.amountPaid))).toEqual([0, 0]);
    expect(await paymentsFor(vendorId)).toHaveLength(0);
  });

  it("gives an opening balance back when the payment had eaten into it", async () => {
    const vendorId = await makeVendor(1000);
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 400, method: "cash" });

    const [afterPayment] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(Number(afterPayment.openingBalance)).toBe(600);

    const [row] = await paymentsFor(vendorId);
    const result = await reverseVendorPaymentCore(org.id, row.id);
    expect(result.ok).toBe(true);

    const [restored] = await db.select().from(vendors).where(eq(vendors.id, vendorId));
    expect(Number(restored.openingBalance)).toBe(1000);
    expect(await paymentsFor(vendorId)).toHaveLength(0);
  });

  it("removes an unapplied advance without touching any bill", async () => {
    const vendorId = await makeVendor();
    const billId = await makeBill(vendorId, 100);
    // 250 against a 100 bill: 100 lands on the bill, 150 is left as a credit.
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 250, method: "cash" });
    const rows = await paymentsFor(vendorId);
    const advance = rows.find((r) => r.purchaseBillId == null)!;
    expect(Number(advance.amount)).toBe(150);

    const result = await reverseVendorPaymentCore(org.id, advance.id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(250);

    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.amountPaid)).toBe(0);
    expect(Number(bill.total)).toBe(100); // the bill itself is untouched
    expect(await paymentsFor(vendorId)).toHaveLength(0);
  });

  it("still reverses as one recording after a line removal released part of it", async () => {
    const vendorId = await makeVendor();
    const billId = await makeBill(vendorId, 500, 50);
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 550, method: "cash" });

    // Removing the 500 line leaves a 50 bill, so 500 of the payment no longer
    // fits and is split off as a credit — a second row that has to reverse
    // along with the rest of the same recording.
    const [line] = await db
      .select()
      .from(purchaseBillItems)
      .where(
        and(eq(purchaseBillItems.purchaseBillId, billId), eq(purchaseBillItems.amount, "500.00")),
      );
    expect(await removePurchaseBillItemCore(org.id, billId, line.id, "unlink")).toEqual({
      ok: true,
    });

    const rows = await paymentsFor(vendorId);
    expect(rows).toHaveLength(2); // 50 still on the bill, 500 sitting as a credit
    const result = await reverseVendorPaymentCore(org.id, rows[0].id);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.amount).toBe(550);
    expect(await paymentsFor(vendorId)).toHaveLength(0);
    const [bill] = await db.select().from(purchaseBills).where(eq(purchaseBills.id, billId));
    expect(Number(bill.amountPaid)).toBe(0);
  });

  it("reports a payment that is already gone instead of throwing", async () => {
    const vendorId = await makeVendor();
    await makeBill(vendorId, 100);
    await recordVendorPaymentCore(org.id, userId, { vendorId, amount: 100, method: "cash" });
    const [row] = await paymentsFor(vendorId);
    expect((await reverseVendorPaymentCore(org.id, row.id)).ok).toBe(true);

    const again = await reverseVendorPaymentCore(org.id, row.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/no longer recorded/i);
  });
});
