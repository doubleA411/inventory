"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { quotations, quotationItems, customers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { computeTotals, financialYear, formatDocNumber } from "@/lib/tax";
import { saveInvoice } from "../invoices/actions";

const itemSchema = z.object({
  description: z.string().trim().min(1),
  hsnSac: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().min(0),
  unit: z.string().trim().optional().nullable(),
  rate: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
});

const quoteSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().nullable().optional(),
  issueDate: z.string().min(1),
  validUntil: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  terms: z.string().trim().optional().nullable(),
  items: z.array(itemSchema),
});

export type QuotationInput = z.infer<typeof quoteSchema>;
export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function saveQuotation(raw: QuotationInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = quoteSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

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
  const totals = computeTotals(
    d.items.map((i) => ({ quantity: i.quantity, rate: i.rate, taxRate: i.taxRate })),
    { gstEnabled: organization.gstRegistered, intraState },
  );

  try {
    const id = await db.transaction(async (tx) => {
      let quoteId = d.id;
      const common = {
        customerId: d.customerId ?? null,
        issueDate: d.issueDate,
        validUntil: d.validUntil || null,
        placeOfSupplyStateCode: placeOfSupply,
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
          .where(and(eq(quotations.id, quoteId), eq(quotations.organizationId, organization.id)));
        await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quoteId));
      } else {
        const fy = financialYear();
        const [last] = await tx
          .select({ seq: quotations.seq })
          .from(quotations)
          .where(and(eq(quotations.organizationId, organization.id), eq(quotations.fy, fy)))
          .orderBy(desc(quotations.seq))
          .limit(1);
        const seq = (last?.seq ?? 0) + 1;
        const number = formatDocNumber(organization.quotePrefix, fy, seq);
        const [row] = await tx
          .insert(quotations)
          .values({
            organizationId: organization.id,
            number,
            seq,
            fy,
            createdBy: user.id,
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
        })),
      );
      return quoteId!;
    });

    revalidatePath("/quotations");
    revalidatePath(`/quotations/${id}`);
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the quotation." };
  }
}

export async function setQuotationStatus(
  id: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<void> {
  const { organization } = await requireRole("admin");
  await db
    .update(quotations)
    .set({ status })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organization.id)));
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function deleteQuotation(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await db
    .delete(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organization.id)));
  revalidatePath("/quotations");
}

/** Owner-only: approve a quotation (unlocks print + convert). */
export async function approveQuotation(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { organization, user } = await requireRole("owner");
  await db
    .update(quotations)
    .set({ approvedAt: new Date(), approvedBy: user.id })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organization.id)));
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

/** Owner-only: revoke a quotation's approval. */
export async function revokeQuotationApproval(id: string): Promise<void> {
  const { organization } = await requireRole("owner");
  await db
    .update(quotations)
    .set({ approvedAt: null, approvedBy: null })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organization.id)));
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

/** Create an invoice from a quotation's items and mark it converted. */
export async function convertToInvoice(
  id: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const [q] = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, organization.id)))
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

  const res = await saveInvoice({
    customerId: q.customerId,
    issueDate: new Date().toISOString().slice(0, 10),
    notes: q.notes,
    terms: q.terms,
    items: items.map((i) => ({
      description: i.description,
      hsnSac: i.hsnSac,
      quantity: Number(i.quantity),
      unit: i.unit,
      rate: Number(i.rate),
      taxRate: Number(i.taxRate),
    })),
  });
  if (!res.ok) return res;

  await db
    .update(quotations)
    .set({ status: "converted", convertedInvoiceId: res.id })
    .where(eq(quotations.id, id));
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true, invoiceId: res.id };
}
