"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
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
    await recordAudit({
      orgId: organization.id,
      action: "purchase_bill.created",
      entityType: "purchase_bill",
      entityId: result.id,
      summary: `Created purchase bill with ${raw.items?.length ?? 0} line${raw.items?.length === 1 ? "" : "s"}`,
      details: { vendorId: raw.vendorId ?? null },
      actorUserId: user.id,
    });
    revalidatePath("/vendors");
    if (raw.vendorId) revalidatePath(`/vendors/${raw.vendorId}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
  }
  return result;
}

export async function cancelPurchaseBill(id: string, vendorId: string | null): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await cancelPurchaseBillCore(organization.id, id);
  await recordAudit({
    orgId: organization.id,
    action: "purchase_bill.cancelled",
    entityType: "purchase_bill",
    entityId: id,
    summary: "Cancelled purchase bill",
    actorUserId: user.id,
  });
  revalidatePath(`/purchase-bills/${id}`);
  revalidatePath("/vendors");
  if (vendorId) revalidatePath(`/vendors/${vendorId}`);
}

export async function deletePurchaseBill(id: string, vendorId: string | null): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await deletePurchaseBillCore(organization.id, id, user.id);
  await recordAudit({
    orgId: organization.id,
    action: "purchase_bill.archived",
    entityType: "purchase_bill",
    entityId: id,
    summary: "Archived purchase bill",
    actorUserId: user.id,
  });
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
  const { organization, user } = await requireRole("admin");
  const result = await removePurchaseBillItemCore(organization.id, billId, itemId, mode);
  if (result.ok) {
    await recordAudit({
      orgId: organization.id,
      action: "purchase_bill.item_removed",
      entityType: "purchase_bill",
      entityId: billId,
      summary:
        mode === "delete_restock"
          ? "Removed a line and reversed its restock"
          : "Removed a line (stock kept)",
      details: { itemId, mode },
      actorUserId: user.id,
    });
    revalidatePath(`/purchase-bills/${billId}`);
    revalidatePath("/vendors");
    if (vendorId) revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/products");
    revalidatePath("/movements");
    revalidatePath("/dashboard");
  }
  return result;
}
