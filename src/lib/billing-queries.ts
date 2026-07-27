import "server-only";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  quotations,
  quotationItems,
  invoices,
  invoiceItems,
  payments,
  users,
} from "@/lib/db/schema";

export async function listCustomers(orgId: string) {
  return db
    .select()
    .from(customers)
    .where(eq(customers.organizationId, orgId))
    .orderBy(asc(customers.name));
}

export async function getCustomer(orgId: string, id: string) {
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, orgId)))
    .limit(1);
  return c ?? null;
}

export async function listQuotations(
  orgId: string,
  opts?: { from?: string; to?: string },
) {
  const conds = [eq(quotations.organizationId, orgId)];
  if (opts?.from) conds.push(gte(quotations.issueDate, opts.from));
  if (opts?.to) conds.push(lte(quotations.issueDate, opts.to));
  return db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      issueDate: quotations.issueDate,
      validUntil: quotations.validUntil,
      total: quotations.total,
      approvedAt: quotations.approvedAt,
      customerName: customers.name,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .where(and(...conds))
    .orderBy(desc(quotations.createdAt));
}

/**
 * Lightweight list for event pickers (e.g. linking an expense) — customer
 * name and the event's actual date (earliest per-line event date, falling
 * back to the issue date) so events are recognisable, not just a number.
 */
export async function listQuotationsForPicker(orgId: string) {
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      customerName: customers.name,
      issueDate: quotations.issueDate,
      earliestEventDate: sql<string | null>`min(${quotationItems.eventDate})`,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .where(eq(quotations.organizationId, orgId))
    .groupBy(quotations.id, customers.name)
    .orderBy(desc(quotations.createdAt));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customerName: r.customerName,
    eventDate: r.earliestEventDate ?? r.issueDate,
  }));
}

export async function getQuotationFull(orgId: string, id: string) {
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)))
    .limit(1);
  if (!q) return null;
  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.position));
  const customer = q.customerId
    ? await getCustomer(orgId, q.customerId)
    : null;
  return { quotation: q, items, customer };
}

export async function listInvoices(
  orgId: string,
  opts?: { from?: string; to?: string },
) {
  const conds = [eq(invoices.organizationId, orgId)];
  if (opts?.from) conds.push(gte(invoices.issueDate, opts.from));
  if (opts?.to) conds.push(lte(invoices.issueDate, opts.to));
  return db
    .select({
      id: invoices.id,
      number: invoices.number,
      docType: invoices.docType,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      approvedAt: invoices.approvedAt,
      customerName: customers.name,
    })
    .from(invoices)
    .leftJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(...conds))
    .orderBy(desc(invoices.createdAt));
}

export async function getInvoiceFull(orgId: string, id: string) {
  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)))
    .limit(1);
  if (!inv) return null;
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, id))
    .orderBy(asc(invoiceItems.position));
  const customer = inv.customerId ? await getCustomer(orgId, inv.customerId) : null;
  const pays = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      reference: payments.reference,
      paidAt: payments.paidAt,
      note: payments.note,
      userName: users.name,
    })
    .from(payments)
    .leftJoin(users, eq(payments.createdBy, users.id))
    .where(eq(payments.invoiceId, id))
    .orderBy(desc(payments.paidAt));
  return { invoice: inv, items, customer, payments: pays };
}

/** Derived, time-aware invoice status for display. */
export type DisplayStatus = "draft" | "sent" | "partial" | "paid" | "overdue" | "cancelled";

export function displayInvoiceStatus(inv: {
  status: string;
  total: string | number;
  amountPaid: string | number;
  dueDate: string | null;
}): DisplayStatus {
  if (inv.status === "cancelled") return "cancelled";
  if (inv.status === "draft") return "draft";
  const total = Number(inv.total);
  const paid = Number(inv.amountPaid);
  if (paid >= total && total > 0) return "paid";
  const overdue =
    inv.dueDate != null && new Date(inv.dueDate) < new Date(new Date().toDateString());
  if (paid > 0) return overdue ? "overdue" : "partial";
  return overdue ? "overdue" : "sent";
}

export async function billingSummary(orgId: string) {
  const invs = await db
    .select({
      status: invoices.status,
      total: invoices.total,
      amountPaid: invoices.amountPaid,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(eq(invoices.organizationId, orgId));

  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const i of invs) {
    if (i.status === "cancelled" || i.status === "draft") continue;
    const due = Number(i.total) - Number(i.amountPaid);
    if (due > 0) {
      outstanding += due;
      const st = displayInvoiceStatus(i);
      if (st === "overdue") {
        overdueCount += 1;
        overdueAmount += due;
      }
    }
  }
  return { outstanding, overdueCount, overdueAmount, invoiceCount: invs.length };
}
