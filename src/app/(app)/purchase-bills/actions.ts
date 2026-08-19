"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import {
  createPurchaseBillCore,
  cancelPurchaseBillCore,
  deletePurchaseBillCore,
  removePurchaseBillItemCore,
  type RemoveBillItemMode,
  type PurchaseBillInput,
  type SaveResult,
} from "@/lib/purchases";

export async function createPurchaseBill(raw: PurchaseBillInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await createPurchaseBillCore(organization, user.id, raw);
  if (result.ok) {
    revalidatePath("/vendors");
    if (raw.vendorId) revalidatePath(`/vendors/${raw.vendorId}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function cancelPurchaseBill(id: string, vendorId: string | null): Promise<void> {
  const { organization } = await requireRole("admin");
  await cancelPurchaseBillCore(organization.id, id);
  revalidatePath(`/purchase-bills/${id}`);
  revalidatePath("/vendors");
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

export async function deletePurchaseBill(id: string, vendorId: string | null): Promise<void> {
  const { organization } = await requireRole("admin");
  await deletePurchaseBillCore(organization.id, id);
  revalidatePath("/vendors");
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

/**
 * Drop one line off an existing bill — either just off the bill ("unlink",
 * stock stays) or stock and all ("delete_restock"). See
 * removePurchaseBillItemCore for what each mode is allowed to touch.
 */
export async function removePurchaseBillItem(
  billId: string,
  itemId: string,
  mode: RemoveBillItemMode,
  vendorId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const result = await removePurchaseBillItemCore(organization.id, billId, itemId, mode);
  if (result.ok) {
    revalidatePath(`/purchase-bills/${billId}`);
    revalidatePath("/vendors");
    if (vendorId) revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
  }
  return result;
}
