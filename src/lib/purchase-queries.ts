import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  vendors,
  purchaseBills,
  purchaseBillItems,
  purchaseBillPayments,
  products,
  users,
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

export async function getPurchaseBillFull(orgId: string, id: string) {
  const [bill] = await db
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.id, id), eq(purchaseBills.organizationId, orgId)))
    .limit(1);
  if (!bill) return null;
  const items = await db
    .select()
    .from(purchaseBillItems)
    .where(eq(purchaseBillItems.purchaseBillId, id))
    .orderBy(asc(purchaseBillItems.position));
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
