import "server-only";
import { and, asc, desc, eq, gt, lt, lte, sql, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  categories,
  units,
  unitGroups,
  stockBatches,
  stockMovements,
  users,
  memberships,
  invoices,
} from "@/lib/db/schema";

export const EXPIRY_SOON_DAYS = 7;

export type ProductRow = {
  id: string;
  name: string;
  code: string | null;
  categoryName: string | null;
  unitSymbol: string;
  currentStock: number;
  reorderLevel: number;
  isActive: boolean;
};

export async function listProducts(
  orgId: string,
  opts?: { search?: string; onlyLow?: boolean },
): Promise<ProductRow[]> {
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      categoryName: categories.name,
      unitSymbol: units.symbol,
      currentStock: products.currentStock,
      reorderLevel: products.reorderLevel,
      isActive: products.isActive,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .innerJoin(units, eq(products.stockUnitId, units.id))
    .where(eq(products.organizationId, orgId))
    .orderBy(asc(products.name));

  let mapped = rows.map((r) => ({
    ...r,
    currentStock: Number(r.currentStock),
    reorderLevel: Number(r.reorderLevel),
  }));

  if (opts?.search) {
    const q = opts.search.toLowerCase();
    mapped = mapped.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q) ||
        (p.categoryName ?? "").toLowerCase().includes(q),
    );
  }
  if (opts?.onlyLow) {
    mapped = mapped.filter((p) => p.currentStock <= p.reorderLevel);
  }
  return mapped;
}

export async function getProductDetail(orgId: string, id: string) {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.organizationId, orgId)))
    .limit(1);
  if (!product) return null;

  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.id, product.stockUnitId))
    .limit(1);

  const category = product.categoryId
    ? (
        await db
          .select()
          .from(categories)
          .where(eq(categories.id, product.categoryId))
          .limit(1)
      )[0] ?? null
    : null;

  const batches = await db
    .select()
    .from(stockBatches)
    .where(and(eq(stockBatches.productId, id), gt(stockBatches.quantityRemaining, "0")))
    .orderBy(sql`${stockBatches.expiryDate} ASC NULLS LAST`, asc(stockBatches.receivedDate));

  const movements = await db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      unitSymbol: units.symbol,
      deltaInStockUnit: stockMovements.deltaInStockUnit,
      balanceAfter: stockMovements.balanceAfter,
      note: stockMovements.note,
      costAmount: stockMovements.costAmount,
      invoiceId: stockMovements.invoiceId,
      invoiceNumber: invoices.number,
      createdAt: stockMovements.createdAt,
      userName: users.name,
    })
    .from(stockMovements)
    .innerJoin(units, eq(stockMovements.unitId, units.id))
    .leftJoin(users, eq(stockMovements.userId, users.id))
    .leftJoin(invoices, eq(stockMovements.invoiceId, invoices.id))
    .where(eq(stockMovements.productId, id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(50);

  return { product, unit, category, batches, movements };
}

export async function listUnits(orgId: string) {
  return db
    .select({
      id: units.id,
      name: units.name,
      symbol: units.symbol,
      factorToBase: units.factorToBase,
      isBase: units.isBase,
      groupId: units.groupId,
      groupName: unitGroups.name,
    })
    .from(units)
    .innerJoin(unitGroups, eq(units.groupId, unitGroups.id))
    .where(eq(units.organizationId, orgId))
    .orderBy(asc(unitGroups.name), asc(units.factorToBase));
}

export async function listUnitGroups(orgId: string) {
  return db
    .select()
    .from(unitGroups)
    .where(eq(unitGroups.organizationId, orgId))
    .orderBy(asc(unitGroups.name));
}

export async function listCategories(orgId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.organizationId, orgId))
    .orderBy(asc(categories.name));
}

export async function recentMovements(orgId: string, limit = 15) {
  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      unitSymbol: units.symbol,
      balanceAfter: stockMovements.balanceAfter,
      createdAt: stockMovements.createdAt,
      productName: products.name,
      productId: products.id,
      userName: users.name,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(units, eq(stockMovements.unitId, units.id))
    .leftJoin(users, eq(stockMovements.userId, users.id))
    .where(eq(stockMovements.organizationId, orgId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

export async function listMembers(orgId: string) {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, orgId))
    .orderBy(asc(memberships.createdAt));
}

export async function listAllMovements(
  orgId: string,
  opts?: {
    type?: string;
    categoryId?: string;
    from?: string;
    to?: string;
    limit?: number;
  },
) {
  const conds = [eq(stockMovements.organizationId, orgId)];
  if (
    opts?.type &&
    ["restock", "usage", "waste", "adjustment"].includes(opts.type)
  ) {
    conds.push(eq(stockMovements.type, opts.type as never));
  }
  if (opts?.categoryId) {
    conds.push(eq(products.categoryId, opts.categoryId));
  }
  if (opts?.from) {
    conds.push(
      sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date >= ${opts.from}`,
    );
  }
  if (opts?.to) {
    conds.push(
      sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date <= ${opts.to}`,
    );
  }
  return db
    .select({
      id: stockMovements.id,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      unitSymbol: units.symbol,
      balanceAfter: stockMovements.balanceAfter,
      note: stockMovements.note,
      costAmount: stockMovements.costAmount,
      invoiceId: stockMovements.invoiceId,
      invoiceNumber: invoices.number,
      createdAt: stockMovements.createdAt,
      productId: products.id,
      productName: products.name,
      userName: users.name,
    })
    .from(stockMovements)
    .innerJoin(products, eq(stockMovements.productId, products.id))
    .innerJoin(units, eq(stockMovements.unitId, units.id))
    .leftJoin(users, eq(stockMovements.userId, users.id))
    .leftJoin(invoices, eq(stockMovements.invoiceId, invoices.id))
    .where(and(...conds))
    .orderBy(desc(stockMovements.createdAt))
    .limit(opts?.limit ?? 200);
}

/** Usage/waste cost aggregated by day (most recent first). */
export async function usageCostByDay(orgId: string, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      day: sql<string>`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`,
      cost: sql<string>`coalesce(sum(${stockMovements.costAmount}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, orgId),
        sql`${stockMovements.type} in ('usage','waste')`,
        gte(
          sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`,
          since,
        ),
      ),
    )
    .groupBy(sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`)
    .orderBy(desc(sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`));
  return rows.map((r) => ({ day: r.day, cost: Number(r.cost), count: Number(r.count) }));
}

/** Usage-cost totals for today and the current month. */
export async function usageCostSummary(orgId: string) {
  const [row] = await db
    .select({
      today: sql<string>`coalesce(sum(${stockMovements.costAmount}) filter (where (${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date), 0)`,
      month: sql<string>`coalesce(sum(${stockMovements.costAmount}) filter (where date_trunc('month', ${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata') = date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')), 0)`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, orgId),
        sql`${stockMovements.type} in ('usage','waste')`,
      ),
    );
  return { today: Number(row?.today ?? 0), month: Number(row?.month ?? 0) };
}

/** Per-product usage totals (quantity in stock unit + cost). */
export async function productUsageTotals(productId: string) {
  const [row] = await db
    .select({
      qty: sql<string>`coalesce(sum(-${stockMovements.deltaInStockUnit}) filter (where ${stockMovements.type} in ('usage','waste')), 0)`,
      cost: sql<string>`coalesce(sum(${stockMovements.costAmount}) filter (where ${stockMovements.type} in ('usage','waste')), 0)`,
    })
    .from(stockMovements)
    .where(eq(stockMovements.productId, productId));
  return { qty: Number(row?.qty ?? 0), cost: Number(row?.cost ?? 0) };
}

export type DashboardStats = {
  totalProducts: number;
  lowStock: ProductRow[];
  outOfStock: number;
  expiringSoon: { productId: string; productName: string; expiryDate: string; qty: number; unitSymbol: string }[];
  expired: { productId: string; productName: string; expiryDate: string; qty: number; unitSymbol: string }[];
  stockValue: number;
};

export async function dashboardStats(orgId: string): Promise<DashboardStats> {
  const allProducts = await listProducts(orgId);
  const lowStock = allProducts.filter(
    (p) => p.isActive && p.currentStock <= p.reorderLevel,
  );
  const outOfStock = allProducts.filter(
    (p) => p.isActive && p.currentStock <= 0,
  ).length;

  // Stock value = sum(currentStock * costPrice) — needs costPrice, join products.
  const valueRows = await db
    .select({
      currentStock: products.currentStock,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(eq(products.organizationId, orgId));
  const stockValue = valueRows.reduce(
    (s, r) => s + Number(r.currentStock) * Number(r.costPrice ?? 0),
    0,
  );

  const todayStr = new Date().toISOString().slice(0, 10);
  const soonStr = new Date(Date.now() + EXPIRY_SOON_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);

  const expBase = db
    .select({
      productId: products.id,
      productName: products.name,
      expiryDate: stockBatches.expiryDate,
      qty: stockBatches.quantityRemaining,
      unitSymbol: units.symbol,
    })
    .from(stockBatches)
    .innerJoin(products, eq(stockBatches.productId, products.id))
    .innerJoin(units, eq(products.stockUnitId, units.id));

  const expiringSoon = (
    await expBase.where(
      and(
        eq(stockBatches.organizationId, orgId),
        gt(stockBatches.quantityRemaining, "0"),
        isNotNull(stockBatches.expiryDate),
        gte(stockBatches.expiryDate, todayStr),
        lte(stockBatches.expiryDate, soonStr),
      ),
    )
  ).map((r) => ({ ...r, expiryDate: r.expiryDate!, qty: Number(r.qty) }));

  const expired = (
    await db
      .select({
        productId: products.id,
        productName: products.name,
        expiryDate: stockBatches.expiryDate,
        qty: stockBatches.quantityRemaining,
        unitSymbol: units.symbol,
      })
      .from(stockBatches)
      .innerJoin(products, eq(stockBatches.productId, products.id))
      .innerJoin(units, eq(products.stockUnitId, units.id))
      .where(
        and(
          eq(stockBatches.organizationId, orgId),
          gt(stockBatches.quantityRemaining, "0"),
          isNotNull(stockBatches.expiryDate),
          lt(stockBatches.expiryDate, todayStr),
        ),
      )
  ).map((r) => ({ ...r, expiryDate: r.expiryDate!, qty: Number(r.qty) }));

  return {
    totalProducts: allProducts.length,
    lowStock,
    outOfStock,
    expiringSoon,
    expired,
    stockValue,
  };
}
