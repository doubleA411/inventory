import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  vendors,
  purchaseBills,
  purchaseBillItems,
  purchaseBillPayments,
  products,
  users,
  stockBatches,
  stockMovements,
  type PurchaseBillItem,
} from "@/lib/db/schema";

/** Lightweight product list for the purchase bill line-item picker. */
export async function listProductsForPicker(orgId: string) {
  return db
    .select({
      id: products.id,
      name: products.name,
      stockUnitId: products.stockUnitId,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(and(eq(products.organizationId, orgId), eq(products.isActive, true)))
    .orderBy(asc(products.name));
}

export async function listVendors(orgId: string) {
  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      phone: vendors.phone,
      district: vendors.district,
      location: vendors.location,
      openingBalance: vendors.openingBalance,
      purchased: sql<string>`coalesce(sum(${purchaseBills.total}), 0)`,
      paid: sql<string>`coalesce(sum(${purchaseBills.amountPaid}), 0)`,
    })
    .from(vendors)
    .leftJoin(
      purchaseBills,
      and(eq(purchaseBills.vendorId, vendors.id), eq(purchaseBills.status, "active")),
    )
    .where(eq(vendors.organizationId, orgId))
    .groupBy(vendors.id)
    .orderBy(asc(vendors.name));

  // Payment splits come from a second pass rather than another join: joining
  // both bills and payments in one query multiplies the rows and inflates
  // every sum. Grouped in SQL, matched up in JS.
  const splits = await db
    .select({
      vendorId: purchaseBillPayments.vendorId,
      appliedTo: purchaseBillPayments.appliedTo,
      total: sql<string>`coalesce(sum(${purchaseBillPayments.amount}), 0)`,
    })
    .from(purchaseBillPayments)
    .where(eq(purchaseBillPayments.organizationId, orgId))
    .groupBy(purchaseBillPayments.vendorId, purchaseBillPayments.appliedTo);

  const splitFor = (vendorId: string, kind: string) =>
    Number(splits.find((r) => r.vendorId === vendorId && r.appliedTo === kind)?.total ?? 0);

  return rows.map((r) => ({
    ...r,
    balance: computeVendorBalance({
      purchased: Number(r.purchased),
      billsPaid: Number(r.paid),
      openingEntered: Number(r.openingBalance),
      openingPaid: splitFor(r.id, "opening_balance"),
      credit: splitFor(r.id, "credit"),
    }),
  }));
}

export async function getVendor(orgId: string, id: string) {
  const [v] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.organizationId, orgId)))
    .limit(1);
  return v ?? null;
}

export async function listPurchaseBillsForVendor(orgId: string, vendorId: string) {
  return db
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.vendorId, vendorId), eq(purchaseBills.organizationId, orgId)))
    .orderBy(desc(purchaseBills.createdAt));
}


export type PurchaseBillItemWithStock = PurchaseBillItem & {
  /**
   * The stock this line brought in, when it's still there: how much of it is
   * left against how much arrived. Null for charge lines and for lines whose
   * batch is already gone. `intact` is false once anything has been drawn from
   * it — which is what decides whether the restock can still be deleted.
   */
  stock: { remaining: number; received: number; intact: boolean } | null;
};

/**
 * Attach each line's remaining-vs-received stock, so the bill page can tell
 * which lines can still have their restock deleted outright and which can only
 * be unlinked from the vendor.
 */
async function withBatchState(
  orgId: string,
  items: PurchaseBillItem[],
): Promise<PurchaseBillItemWithStock[]> {
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      itemId: stockBatches.purchaseBillItemId,
      remaining: stockBatches.quantityRemaining,
      // Only stock-adding movements carry a batchId, so this is what the batch
      // arrived with.
      received: sql<string>`coalesce(sum(${stockMovements.deltaInStockUnit}), 0)`,
    })
    .from(stockBatches)
    .leftJoin(stockMovements, eq(stockMovements.batchId, stockBatches.id))
    .where(
      and(
        eq(stockBatches.organizationId, orgId),
        inArray(stockBatches.purchaseBillItemId, ids),
      ),
    )
    .groupBy(stockBatches.id);

  const byItem = new Map<string, { remaining: number; received: number; intact: boolean }>();
  for (const r of rows) {
    if (!r.itemId) continue;
    const prev = byItem.get(r.itemId) ?? { remaining: 0, received: 0, intact: true };
    const remaining = Number(r.remaining);
    const received = Number(r.received);
    byItem.set(r.itemId, {
      remaining: prev.remaining + remaining,
      received: prev.received + received,
      intact: prev.intact && remaining + 1e-6 >= received,
    });
  }
  return items.map((i) => ({ ...i, stock: byItem.get(i.id) ?? null }));
}

export async function getPurchaseBillFull(orgId: string, id: string) {
  const [bill] = await db
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.id, id), eq(purchaseBills.organizationId, orgId)))
    .limit(1);
  if (!bill) return null;
  const rawItems = await db
    .select()
    .from(purchaseBillItems)
    .where(eq(purchaseBillItems.purchaseBillId, id))
    .orderBy(asc(purchaseBillItems.position));
  const items = await withBatchState(orgId, rawItems);
  const vendor = bill.vendorId ? await getVendor(orgId, bill.vendorId) : null;
  const pays = await db
    .select({
      id: purchaseBillPayments.id,
      amount: purchaseBillPayments.amount,
      appliedTo: purchaseBillPayments.appliedTo,
      method: purchaseBillPayments.method,
      reference: purchaseBillPayments.reference,
      paidAt: purchaseBillPayments.paidAt,
      note: purchaseBillPayments.note,
      userName: users.name,
    })
    .from(purchaseBillPayments)
    .leftJoin(users, eq(purchaseBillPayments.createdBy, users.id))
    .where(eq(purchaseBillPayments.purchaseBillId, id))
    .orderBy(desc(purchaseBillPayments.paidAt));
  return { bill, items, vendor, payments: pays };
}


/**
 * Every rupee that has moved between the caterer and one vendor, counted once.
 *
 * Four things flow through a vendor's balance and the old header only showed
 * two of them: bills raised, payments put against those bills, payments put
 * against the carried-over opening balance, and money handed over that fitted
 * nowhere (an overpayment, or the excess released when a bill line is removed
 * — see removePurchaseBillItemCore). That last bucket was counted in neither
 * "paid" nor "due", so the app could tell a caterer they owed ₹410 while
 * sitting on ₹2,000 of their money.
 *
 * openingBalance is the figure entered at onboarding and never rewritten; how
 * much of it is left is derived here from the payments allocated to it.
 */
export type VendorBalance = {
  /** Total of active bills raised in the app. */
  purchased: number;
  /** Every rupee handed to this vendor, whatever it was put against. */
  paid: number;
  /** The carried-over due as the caterer first entered it. */
  openingEntered: number;
  /** How much of that carried-over due is still outstanding. */
  openingRemaining: number;
  /** Money with the vendor that isn't against anything yet. */
  credit: number;
  /** Positive: still owed to the vendor. Zero when credit covers it. */
  due: number;
};

export function computeVendorBalance(input: {
  purchased: number;
  billsPaid: number;
  openingEntered: number;
  openingPaid: number;
  credit: number;
}): VendorBalance {
  const openingRemaining = round2(Math.max(0, input.openingEntered - input.openingPaid));
  const owed = round2(input.purchased - input.billsPaid + openingRemaining);
  // Credit is real money already handed over, so it offsets what's owed before
  // anything is shown as due. Whatever it doesn't absorb stays as credit.
  const due = round2(Math.max(0, owed - input.credit));
  const credit = round2(Math.max(0, input.credit - owed));
  return {
    purchased: round2(input.purchased),
    paid: round2(input.billsPaid + input.openingPaid + input.credit),
    openingEntered: round2(input.openingEntered),
    openingRemaining,
    credit,
    due,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Payment totals for one vendor, split by what each chunk was put against. */
export async function vendorPaymentTotals(orgId: string, vendorId: string) {
  const rows = await db
    .select({
      appliedTo: purchaseBillPayments.appliedTo,
      total: sql<string>`coalesce(sum(${purchaseBillPayments.amount}), 0)`,
    })
    .from(purchaseBillPayments)
    .where(
      and(
        eq(purchaseBillPayments.organizationId, orgId),
        eq(purchaseBillPayments.vendorId, vendorId),
      ),
    )
    .groupBy(purchaseBillPayments.appliedTo);
  const by = (k: string) => Number(rows.find((r) => r.appliedTo === k)?.total ?? 0);
  return { bill: by("bill"), openingBalance: by("opening_balance"), credit: by("credit") };
}

/**
 * Org-wide vendor dues, for the vendors list header.
 *
 * Deliberately the sum of each vendor's own due rather than one netted
 * calculation: credit sitting with one supplier cannot pay a different one, so
 * netting globally would understate what the caterer actually has to find.
 * A vendor holding credit contributes zero here, never a negative.
 */
export async function vendorsSummary(orgId: string) {
  const rows = await listVendors(orgId);
  const [billCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchaseBills)
    .where(and(eq(purchaseBills.organizationId, orgId), eq(purchaseBills.status, "active")));
  return {
    billCount: billCount?.count ?? 0,
    due: round2(rows.reduce((s, r) => s + r.balance.due, 0)),
    credit: round2(rows.reduce((s, r) => s + r.balance.credit, 0)),
  };
}

/**
 * All payments recorded for this vendor, most recent first — keyed directly
 * on the payment's own vendorId (set at recording time) rather than via the
 * bill, so unassigned advance/credit rows (no bill) still show up.
 */
export async function listPaymentsForVendor(orgId: string, vendorId: string) {
  return db
    .select({
      id: purchaseBillPayments.id,
      amount: purchaseBillPayments.amount,
      appliedTo: purchaseBillPayments.appliedTo,
      method: purchaseBillPayments.method,
      reference: purchaseBillPayments.reference,
      paidAt: purchaseBillPayments.paidAt,
      note: purchaseBillPayments.note,
      // Rows written by one recording share this — it's what groups a split
      // payment back together when reversing it.
      createdAt: purchaseBillPayments.createdAt,
      billId: purchaseBills.id,
      billNumber: purchaseBills.number,
      userName: users.name,
    })
    .from(purchaseBillPayments)
    .leftJoin(purchaseBills, eq(purchaseBillPayments.purchaseBillId, purchaseBills.id))
    .leftJoin(users, eq(purchaseBillPayments.createdBy, users.id))
    .where(
      and(eq(purchaseBillPayments.organizationId, orgId), eq(purchaseBillPayments.vendorId, vendorId)),
    )
    .orderBy(desc(purchaseBillPayments.paidAt));
}
