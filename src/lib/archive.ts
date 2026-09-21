import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  expenses,
  invoices,
  products,
  purchaseBills,
  purchaseLists,
  quotations,
  users,
  vendors,
} from "@/lib/db/schema";

export const archiveKinds = [
  "product",
  "customer",
  "vendor",
  "expense",
  "quotation",
  "invoice",
  "purchase_bill",
  "purchase_list",
] as const;

export type ArchiveKind = (typeof archiveKinds)[number];

export type ArchivedRecord = {
  id: string;
  kind: ArchiveKind;
  label: string;
  detail: string;
  deletedAt: Date;
  deletedBy: string | null;
};

export async function listArchivedRecords(orgId: string): Promise<ArchivedRecord[]> {
  const [
    productRows,
    customerRows,
    vendorRows,
    expenseRows,
    quotationRows,
    invoiceRows,
    purchaseBillRows,
    purchaseListRows,
  ] = await Promise.all([
    db
      .select({
        id: products.id,
        label: products.name,
        detail: products.code,
        deletedAt: products.deletedAt,
        deletedBy: users.name,
      })
      .from(products)
      .leftJoin(users, eq(products.deletedBy, users.id))
      .where(and(eq(products.organizationId, orgId), isNotNull(products.deletedAt))),
    db
      .select({
        id: customers.id,
        label: customers.name,
        detail: customers.phone,
        deletedAt: customers.deletedAt,
        deletedBy: users.name,
      })
      .from(customers)
      .leftJoin(users, eq(customers.deletedBy, users.id))
      .where(and(eq(customers.organizationId, orgId), isNotNull(customers.deletedAt))),
    db
      .select({
        id: vendors.id,
        label: vendors.name,
        detail: vendors.phone,
        deletedAt: vendors.deletedAt,
        deletedBy: users.name,
      })
      .from(vendors)
      .leftJoin(users, eq(vendors.deletedBy, users.id))
      .where(and(eq(vendors.organizationId, orgId), isNotNull(vendors.deletedAt))),
    db
      .select({
        id: expenses.id,
        label: expenses.description,
        detail: expenses.expenseDate,
        deletedAt: expenses.deletedAt,
        deletedBy: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.deletedBy, users.id))
      .where(and(eq(expenses.organizationId, orgId), isNotNull(expenses.deletedAt))),
    db
      .select({
        id: quotations.id,
        label: quotations.number,
        detail: quotations.issueDate,
        deletedAt: quotations.deletedAt,
        deletedBy: users.name,
      })
      .from(quotations)
      .leftJoin(users, eq(quotations.deletedBy, users.id))
      .where(and(eq(quotations.organizationId, orgId), isNotNull(quotations.deletedAt))),
    db
      .select({
        id: invoices.id,
        label: invoices.number,
        detail: invoices.issueDate,
        deletedAt: invoices.deletedAt,
        deletedBy: users.name,
      })
      .from(invoices)
      .leftJoin(users, eq(invoices.deletedBy, users.id))
      .where(and(eq(invoices.organizationId, orgId), isNotNull(invoices.deletedAt))),
    db
      .select({
        id: purchaseBills.id,
        label: purchaseBills.number,
        detail: purchaseBills.billDate,
        deletedAt: purchaseBills.deletedAt,
        deletedBy: users.name,
      })
      .from(purchaseBills)
      .leftJoin(users, eq(purchaseBills.deletedBy, users.id))
      .where(and(eq(purchaseBills.organizationId, orgId), isNotNull(purchaseBills.deletedAt))),
    db
      .select({
        id: purchaseLists.id,
        label: purchaseLists.number,
        detail: purchaseLists.listDate,
        deletedAt: purchaseLists.deletedAt,
        deletedBy: users.name,
      })
      .from(purchaseLists)
      .leftJoin(users, eq(purchaseLists.deletedBy, users.id))
      .where(and(eq(purchaseLists.organizationId, orgId), isNotNull(purchaseLists.deletedAt))),
  ]);

  const rows: ArchivedRecord[] = [
    ...productRows.map((r) => ({ ...r, kind: "product" as const, detail: r.detail || "Product" })),
    ...customerRows.map((r) => ({ ...r, kind: "customer" as const, detail: r.detail || "Customer" })),
    ...vendorRows.map((r) => ({ ...r, kind: "vendor" as const, detail: r.detail || "Vendor" })),
    ...expenseRows.map((r) => ({ ...r, kind: "expense" as const, detail: r.detail })),
    ...quotationRows.map((r) => ({ ...r, kind: "quotation" as const, detail: r.detail })),
    ...invoiceRows.map((r) => ({ ...r, kind: "invoice" as const, detail: r.detail })),
    ...purchaseBillRows.map((r) => ({ ...r, kind: "purchase_bill" as const, detail: r.detail })),
    ...purchaseListRows.map((r) => ({ ...r, kind: "purchase_list" as const, detail: r.detail })),
  ].filter((r): r is ArchivedRecord => r.deletedAt != null);

  return rows.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}
