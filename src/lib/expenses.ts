import "server-only";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  expenseCategories,
  expenses,
  quotations,
  customers,
  stockMovements,
  products,
  units,
} from "@/lib/db/schema";
import { fmtQty } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listExpenseCategories(orgId: string) {
  return db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.organizationId, orgId))
    .orderBy(asc(expenseCategories.name));
}

export async function saveExpenseCategory(orgId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false as const, error: "Enter a category name." };
  try {
    const [row] = await db
      .insert(expenseCategories)
      .values({ organizationId: orgId, name: trimmed })
      .returning();
    return { ok: true as const, id: row.id, name: row.name };
  } catch {
    return { ok: false as const, error: "That category already exists." };
  }
}

export async function deleteExpenseCategory(orgId: string, id: string) {
  await db
    .delete(expenseCategories)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.organizationId, orgId)));
}

// ---------------------------------------------------------------------------
// Expenses (manual entries)
// ---------------------------------------------------------------------------

export const expenseSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  quotationId: z.string().uuid().nullable().optional(),
  expenseDate: z.string().min(1),
  description: z.string().trim().min(1),
  headcount: z.coerce.number().min(0).optional().nullable(),
  rate: z.coerce.number().min(0).optional().nullable(),
  amount: z.coerce.number().min(0),
  notes: z.string().trim().optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveExpense(
  orgId: string,
  userId: string,
  raw: ExpenseInput,
): Promise<SaveResult> {
  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const values = {
    categoryId: d.categoryId || null,
    quotationId: d.quotationId || null,
    expenseDate: d.expenseDate,
    description: d.description,
    headcount: d.headcount != null ? String(d.headcount) : null,
    rate: d.rate != null ? String(d.rate) : null,
    amount: String(d.amount),
    notes: d.notes || null,
  };

  if (d.id) {
    await db
      .update(expenses)
      .set(values)
      .where(and(eq(expenses.id, d.id), eq(expenses.organizationId, orgId)));
    return { ok: true, id: d.id };
  }

  const [row] = await db
    .insert(expenses)
    .values({ organizationId: orgId, createdBy: userId, ...values })
    .returning();
  return { ok: true, id: row.id };
}

export async function getExpense(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function deleteExpense(orgId: string, id: string) {
  await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.organizationId, orgId)));
}

// ---------------------------------------------------------------------------
// Combined ledger: manual expenses + stock usage/waste cost, merged at query
// time only. Stock rows are read-only here — the real record lives in
// stock_movements and is edited from Stock History, never from this table.
// ---------------------------------------------------------------------------

export type LedgerRow = {
  id: string;
  date: string;
  source: "stock" | "expense";
  category: string;
  description: string;
  amount: number;
  quotationId: string | null;
  quotationNumber: string | null;
  customerName: string | null;
  productId?: string;
  // Raw editable fields — only populated for source: "expense", so the row
  // can be handed straight to the edit form without a second fetch.
  categoryId?: string | null;
  headcount?: string | null;
  rate?: string | null;
  notes?: string | null;
};

export type LedgerFilters = {
  from?: string;
  to?: string;
  /** undefined = all categories, "stock" = usage/waste only, else an expense_categories.id */
  category?: string;
  quotationId?: string;
  search?: string;
};

export async function getExpenseLedger(
  orgId: string,
  filters: LedgerFilters,
): Promise<LedgerRow[]> {
  const wantStock = !filters.category || filters.category === "stock";
  const wantExpenses = !filters.category || filters.category !== "stock";
  const rows: LedgerRow[] = [];

  // An event's stock usage is recorded against its converted invoice, not the
  // quotation directly (that's how stock_movements already works) — so
  // filtering stock rows by event means resolving the quotation's invoice.
  let eventInvoiceId: string | null = null;
  if (filters.quotationId) {
    const [q] = await db
      .select({ convertedInvoiceId: quotations.convertedInvoiceId })
      .from(quotations)
      .where(eq(quotations.id, filters.quotationId))
      .limit(1);
    eventInvoiceId = q?.convertedInvoiceId ?? null;
  }

  if (wantStock && (!filters.quotationId || eventInvoiceId)) {
    const conds = [
      eq(stockMovements.organizationId, orgId),
      sql`${stockMovements.type} in ('usage','waste')`,
    ];
    if (filters.from) {
      conds.push(
        gte(sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, filters.from),
      );
    }
    if (filters.to) {
      conds.push(
        lte(sql`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`, filters.to),
      );
    }
    if (eventInvoiceId) conds.push(eq(stockMovements.invoiceId, eventInvoiceId));

    const stockRows = await db
      .select({
        id: stockMovements.id,
        date: sql<string>`(${stockMovements.createdAt} AT TIME ZONE 'Asia/Kolkata')::date`,
        productId: products.id,
        productName: products.name,
        quantity: stockMovements.quantity,
        unitSymbol: units.symbol,
        amount: stockMovements.costAmount,
      })
      .from(stockMovements)
      .innerJoin(products, eq(stockMovements.productId, products.id))
      .innerJoin(units, eq(stockMovements.unitId, units.id))
      .where(and(...conds));

    for (const r of stockRows) {
      rows.push({
        id: r.id,
        date: r.date,
        source: "stock",
        category: "Stock usage",
        description: `${r.productName} — ${fmtQty(r.quantity)} ${r.unitSymbol} used`,
        amount: Number(r.amount),
        quotationId: filters.quotationId ?? null,
        quotationNumber: null,
        customerName: null,
        productId: r.productId,
      });
    }
  }

  if (wantExpenses) {
    const conds = [eq(expenses.organizationId, orgId)];
    if (filters.from) conds.push(gte(expenses.expenseDate, filters.from));
    if (filters.to) conds.push(lte(expenses.expenseDate, filters.to));
    if (filters.quotationId) conds.push(eq(expenses.quotationId, filters.quotationId));
    if (filters.category) conds.push(eq(expenses.categoryId, filters.category));

    const expenseRows = await db
      .select({
        id: expenses.id,
        date: expenses.expenseDate,
        description: expenses.description,
        amount: expenses.amount,
        categoryId: expenses.categoryId,
        categoryName: expenseCategories.name,
        quotationId: expenses.quotationId,
        quotationNumber: quotations.number,
        customerName: customers.name,
        headcount: expenses.headcount,
        rate: expenses.rate,
        notes: expenses.notes,
      })
      .from(expenses)
      .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .leftJoin(quotations, eq(expenses.quotationId, quotations.id))
      .leftJoin(customers, eq(quotations.customerId, customers.id))
      .where(and(...conds));

    for (const r of expenseRows) {
      rows.push({
        id: r.id,
        date: r.date,
        source: "expense",
        category: r.categoryName ?? "Uncategorized",
        description: r.description,
        amount: Number(r.amount),
        quotationId: r.quotationId,
        quotationNumber: r.quotationNumber,
        customerName: r.customerName,
        categoryId: r.categoryId,
        headcount: r.headcount,
        rate: r.rate,
        notes: r.notes,
      });
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (!filters.search) return rows;
  const q = filters.search.toLowerCase();
  return rows.filter(
    (r) =>
      r.description.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q) ||
      (r.quotationNumber ?? "").toLowerCase().includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q),
  );
}

export type LedgerDay = { date: string; items: LedgerRow[]; total: number };

export function groupLedgerByDate(rows: LedgerRow[]): LedgerDay[] {
  const days: LedgerDay[] = [];
  const byDate = new Map<string, LedgerDay>();
  for (const row of rows) {
    let day = byDate.get(row.date);
    if (!day) {
      day = { date: row.date, items: [], total: 0 };
      byDate.set(row.date, day);
      days.push(day);
    }
    day.items.push(row);
    day.total += row.amount;
  }
  return days;
}

/** Sum of manual expense amounts in a date range (inclusive), for quick stats. */
export async function expensesTotal(orgId: string, from: string, to: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, orgId),
        gte(expenses.expenseDate, from),
        lte(expenses.expenseDate, to),
      ),
    );
  return Number(row?.total ?? 0);
}

/** Total cost (stock usage + manual expenses) for a specific event. */
export async function eventExpenseTotal(orgId: string, quotationId: string) {
  const rows = await getExpenseLedger(orgId, { quotationId });
  return { total: rows.reduce((s, r) => s + r.amount, 0), count: rows.length };
}
