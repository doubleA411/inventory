import "server-only";
import { and, asc, desc, eq, gt, gte, lte, ne, or, sql } from "drizzle-orm";
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

/**
 * Finds another customer in this org already using this phone number, so
 * callers can offer "use existing customer" instead of silently creating a
 * duplicate. Excludes `excludeId` so editing a customer doesn't flag itself.
 */
export async function findCustomerByPhone(
  orgId: string,
  phone: string,
  excludeId?: string,
) {
  const conds = [eq(customers.organizationId, orgId), eq(customers.phone, phone)];
  if (excludeId) conds.push(ne(customers.id, excludeId));
  const [c] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(...conds))
    .limit(1);
  return c ?? null;
}

/** All quotations for one customer, most recent first — for the customer detail page. */
export async function listQuotationsForCustomer(orgId: string, customerId: string) {
  return db
    .select()
    .from(quotations)
    .where(and(eq(quotations.customerId, customerId), eq(quotations.organizationId, orgId)))
    .orderBy(desc(quotations.createdAt));
}

/** All invoices for one customer, most recent first — for the customer detail page. */
export async function listInvoicesForCustomer(orgId: string, customerId: string) {
  return db
    .select()
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), eq(invoices.organizationId, orgId)))
    .orderBy(desc(invoices.createdAt));
}

/** All payments recorded against this customer's invoices, most recent first. */
export async function listPaymentsForCustomer(orgId: string, customerId: string) {
  return db
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      reference: payments.reference,
      paidAt: payments.paidAt,
      note: payments.note,
      invoiceId: invoices.id,
      invoiceNumber: invoices.number,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(eq(invoices.customerId, customerId), eq(payments.organizationId, orgId)))
    .orderBy(desc(payments.paidAt));
}

export async function listQuotations(
  orgId: string,
  opts?: { from?: string; to?: string; search?: string },
) {
  const conds = [eq(quotations.organizationId, orgId)];
  if (opts?.from) conds.push(gte(quotations.issueDate, opts.from));
  if (opts?.to) conds.push(lte(quotations.issueDate, opts.to));
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      issueDate: quotations.issueDate,
      validUntil: quotations.validUntil,
      total: quotations.total,
      approvedAt: quotations.approvedAt,
      customerName: customers.name,
      // The function date and whether the date is actually held — the two
      // things a caterer scans this list for. Same item-date fallback as
      // listUpcomingEvents, for quotations that predate quotations.eventDate.
      eventDate: sql<string | null>`coalesce(${quotations.eventDate}, min(${quotationItems.eventDate}))`,
      advanceAmount: quotations.advanceAmount,
      takenAt: quotations.takenAt,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .where(and(...conds))
    .groupBy(quotations.id, customers.name)
    .orderBy(desc(quotations.createdAt));

  if (!opts?.search) return rows;
  const q = opts.search.toLowerCase();
  return rows.filter(
    (r) =>
      r.number.toLowerCase().includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q),
  );
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

/**
 * Bookings with a function date still ahead of them — for the dashboard
 * widget. Only quotations actually taken up (see [[markQuotationTakenCore]] /
 * [[recordQuotationAdvanceCore]] in billing.ts) qualify: a draft or a merely
 * "accepted" estimate hasn't turned into a real date commitment yet, so it
 * would just be clutter here. Sorted by the soonest upcoming session date
 * across each quotation's line items (a multi-day function's already-past
 * days don't count, but its later days do).
 */
export async function listUpcomingEvents(orgId: string, limit = 8) {
  const todayStr = new Date().toISOString().slice(0, 10);
  // quotations.eventDate is the one always-there function date; fall back to
  // the earliest per-line-item date for quotations from before that column
  // existed, or that only ever set dates via the menu editor.
  const nextEventDate = sql<string>`coalesce(${quotations.eventDate}, min(${quotationItems.eventDate}))`;
  // Money actually collected. Once converted, the invoice's payment ledger is
  // the truth — reversing that advance there has to stop this widget claiming
  // it was paid — so the quotation's own advanceAmount is only consulted while
  // no invoice exists yet.
  const collected = sql<string | null>`case
    when ${quotations.status} = 'converted' then max(${invoices.amountPaid})
    else max(${quotations.advanceAmount})
  end`;
  const rows = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      status: quotations.status,
      venue: quotations.venue,
      customerName: customers.name,
      total: quotations.total,
      collected,
      takenAt: quotations.takenAt,
      approvedAt: quotations.approvedAt,
      convertedInvoiceId: quotations.convertedInvoiceId,
      nextEventDate,
    })
    .from(quotations)
    .leftJoin(customers, eq(quotations.customerId, customers.id))
    .leftJoin(quotationItems, eq(quotationItems.quotationId, quotations.id))
    .leftJoin(invoices, eq(invoices.id, quotations.convertedInvoiceId))
    .where(
      and(
        eq(quotations.organizationId, orgId),
        ne(quotations.status, "rejected"),
        ne(quotations.status, "expired"),
        or(sql`${quotations.takenAt} is not null`, gt(quotations.advanceAmount, "0")),
      ),
    )
    .groupBy(quotations.id, customers.name)
    .having(gte(nextEventDate, todayStr))
    .orderBy(asc(nextEventDate))
    .limit(limit);
  return rows;
}

/**
 * The live total and amountPaid on one invoice. Used by the quotation view so
 * a booking that has been converted reports the money its invoice actually
 * holds, rather than the advance figure frozen on the quotation at conversion
 * time. Both numbers come from the invoice: it is the document the customer
 * was actually billed from.
 */
export async function invoiceMoney(orgId: string, invoiceId: string) {
  const [inv] = await db
    .select({ amountPaid: invoices.amountPaid, total: invoices.total })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, orgId)))
    .limit(1);
  return inv ?? null;
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
  opts?: { from?: string; to?: string; search?: string },
) {
  const conds = [eq(invoices.organizationId, orgId)];
  if (opts?.from) conds.push(gte(invoices.issueDate, opts.from));
  if (opts?.to) conds.push(lte(invoices.issueDate, opts.to));
  const rows = await db
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

  if (!opts?.search) return rows;
  const q = opts.search.toLowerCase();
  return rows.filter(
    (r) =>
      r.number.toLowerCase().includes(q) ||
      (r.customerName ?? "").toLowerCase().includes(q),
  );
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
