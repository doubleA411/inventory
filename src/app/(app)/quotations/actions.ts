"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fmtMoney } from "@/lib/utils";
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
    await recordAudit({ orgId: organization.id, action: raw.id ? "quotation.updated" : "quotation.created", entityType: "quotation", entityId: result.id, summary: raw.id ? "Updated quotation" : "Created quotation", actorUserId: user.id });
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${result.id}`);
  }
  return result;
}

export async function setQuotationStatus(
  id: string,
  status: "draft" | "sent" | "accepted" | "rejected" | "expired",
): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await setQuotationStatusCore(organization.id, id, status);
  await recordAudit({ orgId: organization.id, action: "quotation.status_changed", entityType: "quotation", entityId: id, summary: `Changed quotation status to ${status}`, details: { status }, actorUserId: user.id });
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function deleteQuotation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await deleteQuotationCore(organization.id, id, user.id);
  if (result.ok) {
    await recordAudit({ orgId: organization.id, action: "quotation.archived", entityType: "quotation", entityId: id, summary: "Archived quotation", actorUserId: user.id });
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
  await recordAudit({ orgId: organization.id, action: "quotation.approved", entityType: "quotation", entityId: id, summary: "Approved quotation", actorUserId: user.id });
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

/** Owner-only: revoke a quotation's approval. */
export async function revokeQuotationApproval(id: string): Promise<void> {
  const { organization, user } = await requireRole("owner");
  await revokeQuotationApprovalCore(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "quotation.approval_revoked", entityType: "quotation", entityId: id, summary: "Revoked quotation approval", actorUserId: user.id });
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

/** Generate (or replace) this quotation's public share link. */
export async function createQuotationShareLink(id: string): Promise<{ token: string }> {
  const { organization, user } = await requireRole("admin");
  const token = await generateQuotationShareToken(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "quotation.share_link_created", entityType: "quotation", entityId: id, summary: "Created a public share link", actorUserId: user.id });
  revalidatePath(`/quotations/${id}`);
  return { token };
}

/** Revoke the public share link — the old link stops working immediately. */
export async function revokeQuotationShareLink(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await revokeQuotationShareToken(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "quotation.share_link_revoked", entityType: "quotation", entityId: id, summary: "Revoked the public share link", actorUserId: user.id });
  revalidatePath(`/quotations/${id}`);
}

/** Create an invoice from a quotation's items and mark it converted. */
export async function convertToInvoice(
  id: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await convertToInvoiceCore(organization, user.id, id);
  if (result.ok) {
    await recordAudit({ orgId: organization.id, action: "quotation.converted", entityType: "quotation", entityId: id, summary: "Converted quotation to an invoice", details: { invoiceId: result.invoiceId }, actorUserId: user.id });
    await recordAudit({ orgId: organization.id, action: "invoice.created", entityType: "invoice", entityId: result.invoiceId, summary: "Created invoice from quotation", details: { quotationId: id }, actorUserId: user.id });
  }
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
  const { organization, user } = await requireRole("admin");
  const result = await recordQuotationAdvanceCore(organization.id, id, amount, {
    allowOverAdvance,
  });
  if (result.ok) {
    await recordAudit({
      orgId: organization.id,
      action: amount ? "quotation.advance_recorded" : "quotation.advance_cleared",
      entityType: "quotation",
      entityId: id,
      summary: amount ? `Recorded an advance of ${fmtMoney(amount)}` : "Cleared the recorded advance",
      details: { amount: amount || null },
      actorUserId: user.id,
    });
    revalidatePath(`/quotations/${id}`);
    revalidatePath("/dashboard");
  }
  return result;
}

/** Explicitly confirm a booking that hasn't had an advance recorded. */
export async function markQuotationTaken(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await markQuotationTakenCore(organization.id, user.id, id);
  await recordAudit({ orgId: organization.id, action: "quotation.marked_taken", entityType: "quotation", entityId: id, summary: "Confirmed booking without an advance", actorUserId: user.id });
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/dashboard");
}

export async function unmarkQuotationTaken(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await unmarkQuotationTakenCore(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "quotation.unmarked_taken", entityType: "quotation", entityId: id, summary: "Removed booking confirmation", actorUserId: user.id });
  revalidatePath(`/quotations/${id}`);
  revalidatePath("/dashboard");
}
