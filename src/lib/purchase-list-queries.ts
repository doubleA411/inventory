import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchaseLists, purchaseListItems, vendors, products } from "@/lib/db/schema";
import { getVendor } from "@/lib/purchase-queries";

/** Products this vendor is the preferred supplier for — the starting point
 * for a new purchase list to them. */
export async function listPreferredProductsForVendor(orgId: string, vendorId: string) {
  return db
    .select({
      id: products.id,
      name: products.name,
      stockUnitId: products.stockUnitId,
    })
    .from(products)
    .where(
      and(
        eq(products.organizationId, orgId),
        eq(products.preferredVendorId, vendorId),
        eq(products.isActive, true),
      ),
    )
    .orderBy(asc(products.name));
}

export async function listPurchaseListsForVendor(orgId: string, vendorId: string) {
  return db
    .select()
    .from(purchaseLists)
    .where(and(eq(purchaseLists.vendorId, vendorId), eq(purchaseLists.organizationId, orgId)))
    .orderBy(desc(purchaseLists.createdAt));
}

/** All purchase lists across every vendor, for the top-level index page. */
export async function listAllPurchaseLists(orgId: string) {
  return db
    .select({
      id: purchaseLists.id,
      number: purchaseLists.number,
      listDate: purchaseLists.listDate,
      status: purchaseLists.status,
      vendorId: purchaseLists.vendorId,
      vendorName: vendors.name,
    })
    .from(purchaseLists)
    .leftJoin(vendors, eq(purchaseLists.vendorId, vendors.id))
    .where(eq(purchaseLists.organizationId, orgId))
    .orderBy(desc(purchaseLists.createdAt));
}

export async function getPurchaseListFull(orgId: string, id: string) {
  const [list] = await db
    .select()
    .from(purchaseLists)
    .where(and(eq(purchaseLists.id, id), eq(purchaseLists.organizationId, orgId)))
    .limit(1);
  if (!list) return null;
  const items = await db
    .select()
    .from(purchaseListItems)
    .where(eq(purchaseListItems.purchaseListId, id))
    .orderBy(asc(purchaseListItems.position));
  const vendor = list.vendorId ? await getVendor(orgId, list.vendorId) : null;
  return { list, items, vendor };
}
