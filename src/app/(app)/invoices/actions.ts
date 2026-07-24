"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  invoices,
  invoiceItems,
  customers,
  payments,
} from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { computeTotals, financialYear, formatDocNumber } from "@/lib/tax";

const itemSchema = z.object({
  description: z.string().trim().min(1),
  hsnSac: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().min(0),
  unit: z.string().trim().optional().nullable(),
  rate: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
});

const invoiceSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  reverseCharge: z.boolean().optional(),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  items: z.array(itemSchema),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveInvoice(raw: InvoiceInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = invoiceSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

  // Place of supply → intra vs inter-state.
  let customerStateCode: string | null = null;
  if (d.customerId) {
    const [c] = await db
      .select({ stateCode: customers.stateCode })
      .from(customers)
      .where(and(eq(customers.id, d.customerId), eq(customers.organizationId, organization.id)))
      .limit(1);
    customerStateCode = c?.stateCode ?? null;
  }
  const placeOfSupply = customerStateCode ?? organization.stateCode ?? null;
  const intraState = !organization.stateCode || placeOfSupply === organization.stateCode;
  const gstEnabled = organization.gstRegistered;

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
            reverseCharge: d.reverseCharge ?? false,
            placeOfSupplyStateCode: placeOfSupply,
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
          .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organization.id)));
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      } else {
        const fy = financialYear();
        const [last] = await tx
          .select({ seq: invoices.seq })
          .from(invoices)
          .where(and(eq(invoices.organizationId, organization.id), eq(invoices.fy, fy)))
          .orderBy(desc(invoices.seq))
          .limit(1);
        const seq = (last?.seq ?? 0) + 1;
        const number = formatDocNumber(organization.invoicePrefix, fy, seq);
        const [row] = await tx
          .insert(invoices)
          .values({
            organizationId: organization.id,
            number,
            seq,
            fy,
            docType,
            customerId: d.customerId ?? null,
            issueDate: d.issueDate,
            dueDate: d.dueDate || null,
            reverseCharge: d.reverseCharge ?? false,
            placeOfSupplyStateCode: placeOfSupply,
            subtotal: String(totals.subtotal),
            cgst: String(totals.cgst),
            sgst: String(totals.sgst),
            igst: String(totals.igst),
            roundOff: String(totals.roundOff),
            total: String(totals.total),
            notes: d.notes || null,
            terms: d.terms || null,
            createdBy: user.id,
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
        })),
      );

      return invoiceId!;
    });

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${id}`);
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the invoice." };
  }
}

export async function setInvoiceStatus(
  id: string,
  status: "draft" | "sent" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const { organization } = await requireRole("admin");
  if (status === "sent") {
    const [inv] = await db
      .select({ approvedAt: invoices.approvedAt })
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.organizationId, organization.id)))
      .limit(1);
    if (!inv?.approvedAt) {
      return { ok: false, error: "This invoice needs owner approval before it can be sent." };
    }
  }
  await db
    .update(invoices)
    .set({ status })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organization.id)));
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/** Owner-only: approve an invoice (unlocks print + mark-as-sent). */
export async function approveInvoice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { organization, user } = await requireRole("owner");
  await db
    .update(invoices)
    .set({ approvedAt: new Date(), approvedBy: user.id })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organization.id)));
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/** Owner-only: revoke an invoice's approval. */
export async function revokeInvoiceApproval(id: string): Promise<void> {
  const { organization } = await requireRole("owner");
  await db
    .update(invoices)
    .set({ approvedAt: null, approvedBy: null })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organization.id)));
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, organization.id)));
  revalidatePath("/invoices");
}

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  method: z.enum(["cash", "upi", "bank_transfer", "cheque", "card", "other"]),
  reference: z.string().trim().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export async function recordPayment(
  raw: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const [inv] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, d.invoiceId), eq(invoices.organizationId, organization.id)))
    .limit(1);
  if (!inv) return { ok: false, error: "Invoice not found." };

  await db.transaction(async (tx) => {
    await tx.insert(payments).values({
      organizationId: organization.id,
      invoiceId: d.invoiceId,
      amount: String(d.amount),
      method: d.method,
      reference: d.reference || null,
      paidAt: d.paidAt || undefined,
      note: d.note || null,
      createdBy: user.id,
    });
    const newPaid = Number(inv.amountPaid) + d.amount;
    const status =
      newPaid >= Number(inv.total)
        ? "paid"
        : inv.status === "draft"
          ? "sent"
          : inv.status;
    await tx
      .update(invoices)
      .set({ amountPaid: String(newPaid), status })
      .where(eq(invoices.id, d.invoiceId));
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${d.invoiceId}`);
  return { ok: true };
}
