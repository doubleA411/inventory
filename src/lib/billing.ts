import "server-only";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
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
import { computeTotals, financialYear, formatDocNumber } from "@/lib/tax";

// Menu dish names and an event/function date under a line item — printed as
// a menu page ahead of the priced document. Not used for pricing.
const itemSchema = z.object({
  description: z.string().trim().min(1),
  hsnSac: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().min(0),
  unit: z.string().trim().optional().nullable(),
  rate: z.coerce.number().min(0),
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
  items: z.array(itemSchema),
});
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const quoteSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  issueDate: z.string().min(1),
  validUntil: z.string().optional().nullable(),
  venue: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
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

export async function deleteInvoiceCore(orgId: string, id: string): Promise<void> {
  await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
}

export async function recordPaymentCore(
  orgId: string,
  userId: string,
  raw: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
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

  const { placeCode, intraState } = await placeOfSupply(org, d.customerId);
  const totals = computeTotals(
    d.items.map((i) => ({ quantity: i.quantity, rate: i.rate, taxRate: i.taxRate })),
    { gstEnabled: org.gstRegistered, intraState },
  );

  try {
    const id = await db.transaction(async (tx) => {
      let quoteId = d.id;
      const common = {
        customerId: d.customerId ?? null,
        issueDate: d.issueDate,
        validUntil: d.validUntil || null,
        venue: d.venue || null,
        placeOfSupplyStateCode: placeCode,
        subtotal: String(totals.subtotal),
        taxTotal: String(totals.taxTotal),
        total: String(totals.total),
        notes: d.notes || null,
        terms: d.terms || null,
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

export async function deleteQuotationCore(orgId: string, id: string): Promise<void> {
  await db
    .delete(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
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
      unit: i.unit,
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

  return { ok: true, invoiceId: res.id };
}
