import "server-only";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoices,
  invoiceItems,
  quotations,
  quotationItems,
  customers,
  payments,
  type Organization,
} from "@/lib/db/schema";
import { computeTotals, financialYear, formatDocNumber, round2 } from "@/lib/tax";
import { fmtMoney } from "@/lib/utils";
import { logActivity, actorName } from "@/lib/activity";

// Menu dish names and an event/function date under a line item — printed as
// a menu page ahead of the priced document. Not used for pricing.
const itemSchema = z.object({
  description: z.string().trim().min(1),
  hsnSac: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().positive("Enter a quantity greater than 0 for every line item."),
  unit: z.preprocess(
    (v) => v ?? "",
    z.string().trim().min(1, "Choose a unit for every line item."),
  ),
  rate: z.coerce.number().positive("Enter a rate greater than 0 for every line item."),
  taxRate: z.coerce.number().min(0).max(100),
  menuItems: z.array(z.string().trim().min(1)).optional(),
  eventDate: z.string().trim().optional().nullable(),
});

export const invoiceSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  // Only meaningful on creation (see saveInvoiceCore) — set when converting
  // a quotation, so profitability/expense views can find the invoice by
  // its originating event. Left untouched on every subsequent edit.
  quotationId: z.string().uuid().nullable().optional(),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  venue: z.string().trim().optional().nullable(),
  reverseCharge: z.boolean().optional(),
  // Per-invoice override of the org's GST default — off issues a bill of
  // supply instead of a tax invoice. Ignored if the org isn't registered.
  applyGst: z.boolean().optional(),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  // Whether the printed menu page (dish lists) is included on this invoice.
  showMenuList: z.boolean().optional(),
  items: z.array(itemSchema),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const quoteSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  issueDate: z.string().min(1),
  validUntil: z.string().optional().nullable(),
  venue: z.string().trim().optional().nullable(),
  // The function date — separate from validUntil (the quote's own expiry).
  eventDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  // Per-quotation override of the org's GST default — off hides GST from the
  // estimate. Ignored if the org isn't registered.
  applyGst: z.boolean().optional(),
  items: z.array(itemSchema),
});
export type QuotationInput = z.infer<typeof quoteSchema>;

export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  method: z.enum(["cash", "upi", "bank_transfer", "cheque", "card", "other"]),
  reference: z.string().trim().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

async function placeOfSupply(
  org: Organization,
  customerId: string | null | undefined,
) {
  let customerStateCode: string | null = null;
  if (customerId) {
    const [c] = await db
      .select({ stateCode: customers.stateCode })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.organizationId, org.id)))
      .limit(1);
    customerStateCode = c?.stateCode ?? null;
  }
  const placeCode = customerStateCode ?? org.stateCode ?? null;
  const intraState = !org.stateCode || placeCode === org.stateCode;
  return { placeCode, intraState };
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function saveInvoiceCore(
  org: Organization,
  userId: string,
  raw: InvoiceInput,
): Promise<SaveResult> {
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = invoiceSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

  const { placeCode, intraState } = await placeOfSupply(org, d.customerId);
  const gstEnabled = org.gstRegistered ? (d.applyGst ?? true) : false;
  const totals = computeTotals(
    d.items.map((i) => ({ quantity: i.quantity, rate: i.rate, taxRate: i.taxRate })),
    { gstEnabled, intraState },
  );
  const docType = gstEnabled ? "tax_invoice" : "bill_of_supply";

  try {
    const id = await db.transaction(async (tx) => {
      let invoiceId = d.id;

      if (invoiceId) {
        await tx
          .update(invoices)
          .set({
            customerId: d.customerId ?? null,
            issueDate: d.issueDate,
            dueDate: d.dueDate || null,
            venue: d.venue || null,
            reverseCharge: d.reverseCharge ?? false,
            placeOfSupplyStateCode: placeCode,
            docType,
            subtotal: String(totals.subtotal),
            cgst: String(totals.cgst),
            sgst: String(totals.sgst),
            igst: String(totals.igst),
            roundOff: String(totals.roundOff),
            total: String(totals.total),
            notes: d.notes || null,
            terms: d.terms || null,
            showMenuList: d.showMenuList ?? true,
            // editing an approved invoice clears approval — owner must re-approve
            approvedAt: null,
            approvedBy: null,
          })
          .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org.id)));
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      } else {
        const fy = financialYear();
        const [last] = await tx
          .select({ seq: invoices.seq })
          .from(invoices)
          .where(and(eq(invoices.organizationId, org.id), eq(invoices.fy, fy)))
          .orderBy(desc(invoices.seq))
          .limit(1);
        const seq = Math.max(last?.seq ?? 0, org.invoiceStartingNumber) + 1;
        const number = formatDocNumber(org.invoicePrefix, fy, seq);
        const [row] = await tx
          .insert(invoices)
          .values({
            organizationId: org.id,
            number,
            seq,
            fy,
            docType,
            customerId: d.customerId ?? null,
            quotationId: d.quotationId ?? null,
            issueDate: d.issueDate,
            dueDate: d.dueDate || null,
            venue: d.venue || null,
            reverseCharge: d.reverseCharge ?? false,
            placeOfSupplyStateCode: placeCode,
            subtotal: String(totals.subtotal),
            cgst: String(totals.cgst),
            sgst: String(totals.sgst),
            igst: String(totals.igst),
            roundOff: String(totals.roundOff),
            total: String(totals.total),
            notes: d.notes || null,
            terms: d.terms || null,
            showMenuList: d.showMenuList ?? true,
            createdBy: userId,
          })
          .returning();
        invoiceId = row.id;
      }

      await tx.insert(invoiceItems).values(
        d.items.map((i, idx) => ({
          invoiceId: invoiceId!,
          position: idx,
          description: i.description,
          hsnSac: i.hsnSac || null,
          quantity: String(i.quantity),
          unit: i.unit || null,
          rate: String(i.rate),
          taxRate: String(i.taxRate),
          taxableValue: String(totals.lines[idx].taxable),
          cgst: String(totals.lines[idx].cgst),
          sgst: String(totals.lines[idx].sgst),
          igst: String(totals.lines[idx].igst),
          amount: String(totals.lines[idx].amount),
          menuItems: i.menuItems?.length ? i.menuItems : null,
          eventDate: i.eventDate || null,
        })),
      );

      return invoiceId!;
    });

    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the invoice." };
  }
}

export async function setInvoiceStatusCore(
  orgId: string,
  id: string,
  status: "draft" | "sent" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  if (status === "sent") {
    const [inv] = await db
      .select({ approvedAt: invoices.approvedAt })
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)))
      .limit(1);
    if (!inv?.approvedAt) {
      return { ok: false, error: "This invoice needs owner approval before it can be sent." };
    }
  }
  await db
    .update(invoices)
    .set({ status })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
  return { ok: true };
}

export async function approveInvoiceCore(
  orgId: string,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(invoices)
    .set({ approvedAt: new Date(), approvedBy: userId })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
}

export async function revokeInvoiceApprovalCore(orgId: string, id: string): Promise<void> {
  await db
    .update(invoices)
    .set({ approvedAt: null, approvedBy: null })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
}

/**
 * Delete an invoice, unless money has been recorded against it.
 *
 * payments.invoiceId is ON DELETE CASCADE, so deleting a paid invoice takes
 * its payment rows with it — the collected money disappears from the books
 * with nothing left to reconcile against, and even the activity log can only
 * say a payment was reversed, not that a whole invoice went. Cancelling keeps
 * the document and its history while taking it out of the totals, which is
 * what "this bill was a mistake" actually needs.
 */
export async function deleteInvoiceCore(
  orgId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [inv] = await db
    .select({ number: invoices.number, amountPaid: invoices.amountPaid })
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)))
    .limit(1);
  if (!inv) return { ok: false, error: "That invoice no longer exists." };

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.invoiceId, id), eq(payments.organizationId, orgId)));

  if (count > 0 || Number(inv.amountPaid) > 0) {
    return {
      ok: false,
      error: `${inv.number} has payments recorded against it, so deleting it would wipe that money from your books. Cancel it instead — that keeps the record and takes it out of your totals.`,
    };
  }

  await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
  return { ok: true };
}

export type PaymentResult =
  | { ok: true }
  | { ok: false; error: string; overpayment?: { due: number; amount: number } };

/**
 * Record a payment against an invoice.
 *
 * Refuses an amount larger than the balance due unless the caller passes
 * `allowOverpayment`. Typing one zero too many is the commonest money mistake
 * there is, and without this the invoice silently went to a negative Due
 * rendered in the same red as genuinely overdue money. Overpayment stays
 * possible — a customer rounding up is real — but it has to be answered for
 * rather than happening by accident.
 */
export async function recordPaymentCore(
  orgId: string,
  userId: string,
  raw: PaymentInput,
  opts: { allowOverpayment?: boolean } = {},
): Promise<PaymentResult> {
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, d.invoiceId), eq(invoices.organizationId, orgId)))
    .limit(1);
  if (!inv) return { ok: false, error: "Invoice not found." };

  const due = round2(Number(inv.total) - Number(inv.amountPaid));
  if (!opts.allowOverpayment && d.amount > due) {
    return {
      ok: false,
      error:
        due > 0
          ? `That's more than the ${fmtMoney(due)} still due on this bill.`
          : "This bill is already fully paid.",
      overpayment: { due, amount: d.amount },
    };
  }

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      organizationId: orgId,
      invoiceId: d.invoiceId,
      amount: String(d.amount),
      method: d.method,
      reference: d.reference || null,
      paidAt: d.paidAt || undefined,
      note: d.note || null,
      createdBy: userId,
    });
    const newPaid = Number(inv.amountPaid) + d.amount;
    const status =
      newPaid >= Number(inv.total) ? "paid" : inv.status === "draft" ? "sent" : inv.status;
    await tx
      .update(invoices)
      .set({ amountPaid: String(newPaid), status })
      .where(eq(invoices.id, d.invoiceId));
  });

  return { ok: true };
}

/**
 * Undo a mistakenly recorded invoice payment. Unlike a vendor payment,
 * a customer payment is never split — it always lands as exactly one row
 * against exactly one invoice (see recordPaymentCore) — so reversing it is
 * just deleting that row and giving the amount back to the invoice's due.
 *
 * A status of "paid" only ever came from this money, so if removing it drops
 * the invoice back under its total, the status steps back to "sent" (never
 * back to "draft" — being sent doesn't undo). Any other status (including
 * "cancelled") is left alone.
 *
 * The payment row is deleted, so the reversal is written to the activity log
 * inside the same transaction — otherwise the money would leave the books with
 * no record of who took it off or when.
 */
export async function reverseInvoicePaymentCore(
  orgId: string,
  userId: string,
  paymentId: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  try {
    return await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, paymentId), eq(payments.organizationId, orgId)))
        .limit(1);
      if (!payment) return { ok: false as const, error: "That payment is no longer recorded." };

      const [inv] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, payment.invoiceId))
        .limit(1);
      if (inv) {
        const amount = Number(payment.amount);
        const newPaid = Math.max(0, round2(Number(inv.amountPaid) - amount));
        const status =
          inv.status === "paid" && newPaid < Number(inv.total) ? "sent" : inv.status;
        await tx
          .update(invoices)
          .set({ amountPaid: String(newPaid), status })
          .where(eq(invoices.id, inv.id));
      }

      await tx.delete(payments).where(eq(payments.id, paymentId));

      const amount = Number(payment.amount);
      await logActivity(tx, {
        orgId,
        action: "payment_reversed",
        entityType: "payment",
        entityId: payment.id,
        invoiceId: payment.invoiceId,
        amount,
        summary: `Reversed a ${fmtMoney(amount)} ${payment.method.replace("_", " ")} payment${
          inv ? ` on ${inv.number}` : ""
        }`,
        userId,
        userName: await actorName(tx, userId),
      });

      return { ok: true as const, amount };
    });
  } catch {
    return { ok: false, error: "Could not reverse that payment." };
  }
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

export async function saveQuotationCore(
  org: Organization,
  userId: string,
  raw: QuotationInput,
): Promise<SaveResult> {
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = quoteSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

  // A converted quotation is frozen: its invoice is a document the customer
  // already has, and editing the quotation afterwards silently produced two
  // different prices for one job with nothing linking them. Duplicate is the
  // way to quote a changed price — it starts a fresh quotation and leaves the
  // issued invoice alone.
  if (d.id) {
    const [existing] = await db
      .select({ status: quotations.status, number: quotations.number })
      .from(quotations)
      .where(and(eq(quotations.id, d.id), eq(quotations.organizationId, org.id)))
      .limit(1);
    if (existing?.status === "converted") {
      return {
        ok: false,
        error: `${existing.number} has already been turned into an invoice, so it can't be changed. Use Duplicate to make a new quotation from it.`,
      };
    }
  }

  const { placeCode, intraState } = await placeOfSupply(org, d.customerId);
  const gstEnabled = org.gstRegistered ? (d.applyGst ?? true) : false;
  const totals = computeTotals(
    d.items.map((i) => ({ quantity: i.quantity, rate: i.rate, taxRate: i.taxRate })),
    { gstEnabled, intraState },
  );

  try {
    const id = await db.transaction(async (tx) => {
      let quoteId = d.id;
      const common = {
        customerId: d.customerId ?? null,
        issueDate: d.issueDate,
        validUntil: d.validUntil || null,
        venue: d.venue || null,
        eventDate: d.eventDate || null,
        placeOfSupplyStateCode: placeCode,
        subtotal: String(totals.subtotal),
        taxTotal: String(totals.taxTotal),
        total: String(totals.total),
        notes: d.notes || null,
        terms: d.terms || null,
        applyGst: d.applyGst ?? true,
      };

      if (quoteId) {
        await tx
          .update(quotations)
          // editing an approved quotation clears approval — owner must re-approve
          .set({ ...common, approvedAt: null, approvedBy: null })
          .where(and(eq(quotations.id, quoteId), eq(quotations.organizationId, org.id)));
        await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quoteId));
      } else {
        const fy = financialYear();
        const [last] = await tx
          .select({ seq: quotations.seq })
          .from(quotations)
          .where(and(eq(quotations.organizationId, org.id), eq(quotations.fy, fy)))
          .orderBy(desc(quotations.seq))
          .limit(1);
        const seq = (last?.seq ?? 0) + 1;
        const number = formatDocNumber(org.quotePrefix, fy, seq);
        const [row] = await tx
          .insert(quotations)
          .values({
            organizationId: org.id,
            number,
            seq,
            fy,
            createdBy: userId,
            ...common,
          })
          .returning();
        quoteId = row.id;
      }

      await tx.insert(quotationItems).values(
        d.items.map((i, idx) => ({
          quotationId: quoteId!,
          position: idx,
          description: i.description,
          hsnSac: i.hsnSac || null,
          quantity: String(i.quantity),
          unit: i.unit || null,
          rate: String(i.rate),
          taxRate: String(i.taxRate),
          amount: String(totals.lines[idx].taxable),
          menuItems: i.menuItems?.length ? i.menuItems : null,
          eventDate: i.eventDate || null,
        })),
      );
      return quoteId!;
    });

    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the quotation." };
  }
}

export async function setQuotationStatusCore(
  orgId: string,
  id: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<void> {
  await db
    .update(quotations)
    .set({ status })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

/**
 * Delete a quotation, unless an invoice was already raised from it.
 *
 * A converted quotation is load-bearing: the invoice's quotationId and every
 * linked expense's quotationId are ON DELETE SET NULL, so deleting it doesn't
 * fail loudly — it quietly cuts the invoice loose and erases the expense-to-
 * event links that the profitability figures are built from. Cancel the
 * invoice instead if the job fell through; that keeps the trail.
 */
export async function deleteQuotationCore(
  orgId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [q] = await db
    .select({ status: quotations.status, number: quotations.number })
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)))
    .limit(1);
  if (!q) return { ok: false, error: "That quotation no longer exists." };
  if (q.status === "converted") {
    return {
      ok: false,
      error: `${q.number} has an invoice raised from it, so it can't be deleted. Cancel the invoice instead if this job isn't happening.`,
    };
  }

  await db
    .delete(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
  return { ok: true };
}

export async function approveQuotationCore(
  orgId: string,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(quotations)
    .set({ approvedAt: new Date(), approvedBy: userId })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

export async function revokeQuotationApprovalCore(orgId: string, id: string): Promise<void> {
  await db
    .update(quotations)
    .set({ approvedAt: null, approvedBy: null })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

export type AdvanceResult =
  | { ok: true }
  | { ok: false; error: string; overAdvance?: { total: number; amount: number } };

/**
 * Record (or correct) the advance/deposit collected for this booking. Not a
 * payment ledger like invoice/vendor payments — just the one running total a
 * caterer needs to know "has this date actually been paid for", set directly
 * rather than accumulated, so a correction is just re-entering the right
 * number. Passing 0 or null clears it back to "no advance recorded".
 *
 * Refuses an advance larger than the quotation total unless the caller passes
 * `allowOverAdvance`. An advance is collected against a price that's already
 * on the screen, so a figure above it is nearly always a stray zero — and it
 * would otherwise ride through conversion into an invoice payment that
 * overpays the bill (see convertToInvoiceCore).
 */
export async function recordQuotationAdvanceCore(
  orgId: string,
  id: string,
  amount: number | null,
  opts: { allowOverAdvance?: boolean } = {},
): Promise<AdvanceResult> {
  if (amount != null && !(amount >= 0)) {
    return { ok: false, error: "Enter an amount of 0 or more." };
  }

  const [q] = await db
    .select({ total: quotations.total })
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)))
    .limit(1);
  if (!q) return { ok: false, error: "That quotation no longer exists." };

  const total = Number(q.total);
  if (amount != null && !opts.allowOverAdvance && amount > total) {
    return {
      ok: false,
      error: `That's more than the ${fmtMoney(total)} total of this quotation.`,
      overAdvance: { total, amount },
    };
  }

  const recorded = amount ? amount : null;
  await db
    .update(quotations)
    .set({
      advanceAmount: recorded != null ? String(recorded) : null,
      advanceRecordedAt: recorded != null ? new Date() : null,
    })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
  return { ok: true };
}

/** Explicitly confirm a booking with no advance down yet (a regular). */
export async function markQuotationTakenCore(
  orgId: string,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(quotations)
    .set({ takenAt: new Date(), takenBy: userId })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

export async function unmarkQuotationTakenCore(orgId: string, id: string): Promise<void> {
  await db
    .update(quotations)
    .set({ takenAt: null, takenBy: null })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

/** Create an invoice from a quotation's items and mark it converted. */
export async function convertToInvoiceCore(
  org: Organization,
  userId: string,
  id: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, org.id)))
    .limit(1);
  if (!q) return { ok: false, error: "Quotation not found." };
  if (!q.approvedAt) {
    return { ok: false, error: "This quotation needs owner approval before it can be converted." };
  }

  const items = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(quotationItems.position);

  const res = await saveInvoiceCore(org, userId, {
    customerId: q.customerId,
    quotationId: q.id,
    issueDate: new Date().toISOString().slice(0, 10),
    venue: q.venue,
    notes: q.notes,
    terms: q.terms,
    items: items.map((i) => ({
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: Number(i.quantity),
      unit: i.unit ?? "",
      rate: Number(i.rate),
      taxRate: Number(i.taxRate),
      menuItems: i.menuItems ?? undefined,
      eventDate: i.eventDate,
    })),
  });
  if (!res.ok) return res;

  await db
    .update(quotations)
    .set({ status: "converted", convertedInvoiceId: res.id })
    .where(eq(quotations.id, id));

  // Carry the booking advance over as the invoice's first payment — the
  // money was already collected, so the invoice should open already
  // partly paid, not re-ask for the full total. Payment method isn't
  // tracked at the quotation stage (advanceAmount is just a running total),
  // so this records it as "cash" and says where it actually came from in
  // the note; staff can correct the method on the invoice if it wasn't.
  if (Number(q.advanceAmount) > 0) {
    await recordPaymentCore(org.id, userId, {
      invoiceId: res.id,
      amount: Number(q.advanceAmount),
      method: "cash",
      paidAt: q.advanceRecordedAt?.toISOString().slice(0, 10),
      note: `Advance recorded on ${q.number}`,
    });
  }

  return { ok: true, invoiceId: res.id };
}
