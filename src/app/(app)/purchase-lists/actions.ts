"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createPurchaseListCore,
  updatePurchaseListCore,
  duplicatePurchaseListCore,
  markPurchaseListSentCore,
  deletePurchaseListCore,
  type PurchaseListInput,
  type SaveResult,
} from "@/lib/purchase-lists";

function revalidateAfterSave(vendorId: string | null) {
  revalidatePath("/purchase-lists");
  revalidatePath("/vendors");
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

export async function createPurchaseList(raw: PurchaseListInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await createPurchaseListCore(organization, user.id, raw);
  if (result.ok) revalidateAfterSave(raw.vendorId);
  return result;
}

export async function updatePurchaseList(
  id: string,
  raw: PurchaseListInput,
): Promise<SaveResult> {
  const { organization } = await requireRole("admin");
  const result = await updatePurchaseListCore(organization.id, id, raw);
  if (result.ok) {
    revalidateAfterSave(raw.vendorId);
    revalidatePath(`/purchase-lists/${id}`);
  }
  return result;
}

export async function duplicatePurchaseList(id: string): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await duplicatePurchaseListCore(organization, user.id, id);
  if (result.ok) revalidateAfterSave(null);
  return result;
}

export async function markPurchaseListSent(id: string, vendorId: string | null): Promise<void> {
  const { organization } = await requireRole("admin");
  await markPurchaseListSentCore(organization.id, id);
  revalidatePath(`/purchase-lists/${id}`);
  revalidateAfterSave(vendorId);
}

export async function deletePurchaseList(id: string, vendorId: string | null): Promise<void> {
  const { organization } = await requireRole("admin");
  await deletePurchaseListCore(organization.id, id);
  revalidateAfterSave(vendorId);
}
