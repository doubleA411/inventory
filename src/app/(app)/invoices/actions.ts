"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  saveInvoiceCore,
  setInvoiceStatusCore,
  approveInvoiceCore,
  revokeInvoiceApprovalCore,
  deleteInvoiceCore,
  recordPaymentCore,
  type InvoiceInput,
  type PaymentInput,
  type SaveResult,
} from "@/lib/billing";

export async function saveInvoice(raw: InvoiceInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await saveInvoiceCore(organization, user.id, raw);
  if (result.ok) {
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${result.id}`);
  }
  return result;
}

export async function setInvoiceStatus(
  id: string,
  status: "draft" | "sent" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const { organization } = await requireRole("admin");
  const result = await setInvoiceStatusCore(organization.id, id, status);
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
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  return { ok: true };
}

/** Owner-only: revoke an invoice's approval. */
export async function revokeInvoiceApproval(id: string): Promise<void> {
  const { organization } = await requireRole("owner");
  await revokeInvoiceApprovalCore(organization.id, id);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
}

export async function deleteInvoice(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await deleteInvoiceCore(organization.id, id);
  revalidatePath("/invoices");
}

export async function recordPayment(
  raw: PaymentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await recordPaymentCore(organization.id, user.id, raw);
  revalidatePath("/invoices");
  revalidatePath(`/invoices/${raw.invoiceId}`);
  return result;
}
