"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  saveQuotationCore,
  setQuotationStatusCore,
  deleteQuotationCore,
  approveQuotationCore,
  revokeQuotationApprovalCore,
  convertToInvoiceCore,
  recordQuotationAdvanceCore,
  markQuotationTakenCore,
  unmarkQuotationTakenCore,
  type QuotationInput,
  type SaveResult,
  type AdvanceResult,
} from "@/lib/billing";
import { generateQuotationShareToken, revokeQuotationShareToken } from "@/lib/sharing";

export async function saveQuotation(raw: QuotationInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await saveQuotationCore(organization, user.id, raw);
  if (result.ok) {
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${result.id}`);
  }
  return result;
}

export async function setQuotationStatus(
  id: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<void> {
  const { organization } = await requireRole("admin");
  await setQuotationStatusCore(organization.id, id, status);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function deleteQuotation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const result = await deleteQuotationCore(organization.id, id);
  if (result.ok) {
    revalidatePath("/quotations");
    revalidatePath("/dashboard");
  }
  return result;
}

/** Owner-only: approve a quotation (unlocks print + convert). */
export async function approveQuotation(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { organization, user } = await requireRole("owner");
  await approveQuotationCore(organization.id, user.id, id);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

/** Owner-only: revoke a quotation's approval. */
export async function revokeQuotationApproval(id: string): Promise<void> {
  const { organization } = await requireRole("owner");
  await revokeQuotationApprovalCore(organization.id, id);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

/** Generate (or replace) this quotation's public share link. */
export async function createQuotationShareLink(id: string): Promise<{ token: string }> {
  const { organization } = await requireRole("admin");
  const token = await generateQuotationShareToken(organization.id, id);
  revalidatePath(`/quotations/${id}`);
  return { token };
}

/** Revoke the public share link — the old link stops working immediately. */
export async function revokeQuotationShareLink(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await revokeQuotationShareToken(organization.id, id);
  revalidatePath(`/quotations/${id}`);
}

/** Create an invoice from a quotation's items and mark it converted. */
export async function convertToInvoice(
  id: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await convertToInvoiceCore(organization, user.id, id);
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  if (result.ok) revalidatePath(`/invoices/${result.invoiceId}`);
  return result;
}

/**
 * Record (or clear) the advance collected for this booking. `allowOverAdvance`
 * is the user answering "yes, really" to an amount above the quotation total.
 */
export async function recordQuotationAdvance(
  id: string,
  amount: number | null,
  allowOverAdvance = false,
): Promise<AdvanceResult> {
  const { organization } = await requireRole("admin");
  const result = await recordQuotationAdvanceCore(organization.id, id, amount, {
    allowOverAdvance,
  });
  if (result.ok) {
    revalidatePath(`/quotations/${id}`);
    revalidatePath("/dashboard");
  }
  return result;
}

/** Explicitly confirm a booking that hasn't had an advance recorded. */
export async function markQuotationTaken(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await markQuotationTakenCore(organization.id, user.id, id);
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/dashboard");
}

export async function unmarkQuotationTaken(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await unmarkQuotationTakenCore(organization.id, id);
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/dashboard");
}
