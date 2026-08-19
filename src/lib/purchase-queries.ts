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
  return rows;
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

/** Org-wide vendor dues, for the vendors list header. */
export async function vendorsSummary(orgId: string) {
  const [rows, openingRows] = await Promise.all([
    db
      .select({
        total: purchaseBills.total,
        amountPaid: purchaseBills.amountPaid,
      })
      .from(purchaseBills)
      .where(and(eq(purchaseBills.organizationId, orgId), eq(purchaseBills.status, "active"))),
    db
      .select({ openingBalance: vendors.openingBalance })
      .from(vendors)
      .where(eq(vendors.organizationId, orgId)),
  ]);
  const billsDue = rows.reduce((s, r) => s + (Number(r.total) - Number(r.amountPaid)), 0);
  const openingDue = openingRows.reduce((s, r) => s + Number(r.openingBalance), 0);
  return { billCount: rows.length, due: billsDue + openingDue };
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
