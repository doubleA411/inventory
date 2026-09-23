"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  saveInvoiceCore,
  setInvoiceStatusCore,
  approveInvoiceCore,
  revokeInvoiceApprovalCore,
  deleteInvoiceCore,
  recordPaymentCore,
  reverseInvoicePaymentCore,
  type InvoiceInput,
  type PaymentInput,
  type PaymentResult,
  type SaveResult,
} from "@/lib/billing";
import { generateInvoiceShareToken, revokeInvoiceShareToken } from "@/lib/sharing";

export async function saveInvoice(raw: InvoiceInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await saveInvoiceCore(organization, user.id, raw);
  if (result.ok) {
    await recordAudit({ orgId: organization.id, action: raw.id ? "invoice.updated" : "invoice.created", entityType: "invoice", entityId: result.id, summary: raw.id ? "Updated invoice" : "Created invoice", actorUserId: user.id });
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${result.id}`);
  }
  return result;
}

export async function setInvoiceStatus(
  id: string,
  status: "draft" | "sent" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await setInvoiceStatusCore(organization.id, id, status);
  if (result.ok) await recordAudit({ orgId: organization.id, action: "invoice.status_changed", entityType: "invoice", entityId: id, summary: `Changed invoice status to ${status}`, details: { status }, actorUserId: user.id });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return result;
}

/** Owner-only: approve an invoice (unlocks print + mark-as-sent). */
export async function approveInvoice(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { organization, user } = await requireRole("owner");
  await approveInvoiceCore(organization.id, user.id, id);
  await recordAudit({ orgId: organization.id, action: "invoice.approved", entityType: "invoice", entityId: id, summary: "Approved invoice", actorUserId: user.id });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/** Owner-only: revoke an invoice's approval. */
export async function revokeInvoiceApproval(id: string): Promise<void> {
  const { organization, user } = await requireRole("owner");
  await revokeInvoiceApprovalCore(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "invoice.approval_revoked", entityType: "invoice", entityId: id, summary: "Revoked invoice approval", actorUserId: user.id });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await deleteInvoiceCore(organization.id, id, user.id);
  if (result.ok) {
    await recordAudit({ orgId: organization.id, action: "invoice.archived", entityType: "invoice", entityId: id, summary: "Archived invoice", actorUserId: user.id });
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
  }
  return result;
}

/** Generate (or replace) this invoice's public share link. */
export async function createInvoiceShareLink(id: string): Promise<{ token: string }> {
  const { organization, user } = await requireRole("admin");
  const token = await generateInvoiceShareToken(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "invoice.share_link_created", entityType: "invoice", entityId: id, summary: "Created a public share link", actorUserId: user.id });
  revalidatePath(`/invoices/${id}`);
  return { token };
}

/** Revoke the public share link — the old link stops working immediately. */
export async function revokeInvoiceShareLink(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await revokeInvoiceShareToken(organization.id, id);
  await recordAudit({ orgId: organization.id, action: "invoice.share_link_revoked", entityType: "invoice", entityId: id, summary: "Revoked the public share link", actorUserId: user.id });
  revalidatePath(`/invoices/${id}`);
}

export async function recordPayment(
  raw: PaymentInput,
  allowOverpayment = false,
): Promise<PaymentResult> {
  const { organization, user } = await requireRole("admin");
  const result = await recordPaymentCore(organization.id, user.id, raw, { allowOverpayment });
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${raw.invoiceId}`);
  return result;
}

/** Undo a mistakenly recorded invoice payment. See reverseInvoicePaymentCore. */
export async function reverseInvoicePayment(
  paymentId: string,
  invoiceId: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await reverseInvoicePaymentCore(organization.id, user.id, paymentId);
  if (result.ok) {
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/dashboard");
  }
  return result;
}
