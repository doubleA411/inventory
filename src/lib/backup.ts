import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  organizations,
  memberships,
  users,
  categories,
  unitGroups,
  units,
  products,
  stockBatches,
  stockMovements,
  customers,
  quotations,
  quotationItems,
  invoices,
  invoiceItems,
  payments,
  expenseCategories,
  expenses,
} from "@/lib/db/schema";

export const BACKUP_VERSION = 1;

/**
 * Every table in one org's business data, as plain rows ready to serialize.
 *
 * Deliberately excludes `password_reset_tokens` (an internal auth artifact,
 * not business data) and strips `passwordHash` off every member — a backup
 * is downloaded and stored outside the app's own access controls, so it must
 * never carry a credential that could be used to sign in.
 */
export async function buildBackup(orgId: string) {
  const [org, memberRows] = await Promise.all([
    db.select().from(organizations).where(eq(organizations.id, orgId)),
    db.select().from(memberships).where(eq(memberships.organizationId, orgId)),
  ]);
  if (!org[0]) throw new Error("Organization not found.");

  const userIds = memberRows.map((m) => m.userId);
  const userRows = userIds.length
    ? await db.select().from(users).where(inArray(users.id, userIds))
    : [];
  const members = memberRows.map((m) => {
    const u = userRows.find((r) => r.id === m.userId);
    return {
      membershipId: m.id,
      userId: m.userId,
      role: m.role,
      name: u?.name ?? null,
      email: u?.email ?? null,
      memberSince: m.createdAt,
    };
  });

  const [
    categoryRows,
    unitGroupRows,
    unitRows,
    productRows,
    batchRows,
    movementRows,
    customerRows,
    quotationRows,
    invoiceRows,
    paymentRows,
    expenseCategoryRows,
    expenseRows,
  ] = await Promise.all([
    db.select().from(categories).where(eq(categories.organizationId, orgId)),
    db.select().from(unitGroups).where(eq(unitGroups.organizationId, orgId)),
    db.select().from(units).where(eq(units.organizationId, orgId)),
    db.select().from(products).where(eq(products.organizationId, orgId)),
    db.select().from(stockBatches).where(eq(stockBatches.organizationId, orgId)),
    db.select().from(stockMovements).where(eq(stockMovements.organizationId, orgId)),
    db.select().from(customers).where(eq(customers.organizationId, orgId)),
    db.select().from(quotations).where(eq(quotations.organizationId, orgId)),
    db.select().from(invoices).where(eq(invoices.organizationId, orgId)),
    db.select().from(payments).where(eq(payments.organizationId, orgId)),
    db.select().from(expenseCategories).where(eq(expenseCategories.organizationId, orgId)),
    db.select().from(expenses).where(eq(expenses.organizationId, orgId)),
  ]);

  // quotation_items / invoice_items carry no organization_id of their own —
  // they're scoped through their parent, so fetch via the parent id list.
  const quotationIds = quotationRows.map((q) => q.id);
  const invoiceIds = invoiceRows.map((i) => i.id);
  const [quotationItemRows, invoiceItemRows] = await Promise.all([
    quotationIds.length
      ? db.select().from(quotationItems).where(inArray(quotationItems.quotationId, quotationIds))
      : [],
    invoiceIds.length
      ? db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds))
      : [],
  ]);

  return {
    meta: {
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      organizationId: orgId,
    },
    organization: org[0],
    members,
    categories: categoryRows,
    unitGroups: unitGroupRows,
    units: unitRows,
    products: productRows,
    stockBatches: batchRows,
    stockMovements: movementRows,
    customers: customerRows,
    quotations: quotationRows,
    quotationItems: quotationItemRows,
    invoices: invoiceRows,
    invoiceItems: invoiceItemRows,
    payments: paymentRows,
    expenseCategories: expenseCategoryRows,
    expenses: expenseRows,
  };
}

export type BackupData = Awaited<ReturnType<typeof buildBackup>>;

/** Table order/labels for the human-readable multi-sheet workbook. */
export const BACKUP_SHEETS: { key: keyof BackupData; label: string }[] = [
  { key: "members", label: "Team" },
  { key: "categories", label: "Categories" },
  { key: "unitGroups", label: "Unit groups" },
  { key: "units", label: "Units" },
  { key: "products", label: "Products" },
  { key: "stockBatches", label: "Stock batches" },
  { key: "stockMovements", label: "Stock movements" },
  { key: "customers", label: "Customers" },
  { key: "quotations", label: "Quotations" },
  { key: "quotationItems", label: "Quotation items" },
  { key: "invoices", label: "Invoices" },
  { key: "invoiceItems", label: "Invoice items" },
  { key: "payments", label: "Payments" },
  { key: "expenseCategories", label: "Expense categories" },
  { key: "expenses", label: "Expenses" },
];
