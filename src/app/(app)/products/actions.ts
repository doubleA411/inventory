"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, categories } from "@/lib/db/schema";
import { requireAuth, requireRole } from "@/lib/auth";
import { applyMovement } from "@/lib/stock";
import { productSchema, createProduct, updateProduct } from "@/lib/products";
import { restockWithVendor } from "@/lib/purchases";

export type ActionState = { error?: string; ok?: boolean };

function str(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

const restockOnSaveSchema = z.object({
  restockQty: z.coerce.number().min(0).optional().nullable(),
  restockPaidNow: z.coerce.number().min(0).optional().nullable(),
});

/**
 * If the product form's "log a purchase" fields were filled in (a vendor is
 * set and a quantity was entered), restock the product and create a
 * one-line purchase bill for it — the same flow as the Restock quick-path,
 * triggered from the product form instead. Silently skipped otherwise, so
 * ordinary edits never restock or create a bill.
 */
async function maybeRestockFromProductForm(
  organization: Parameters<typeof restockWithVendor>[0],
  userId: string,
  productId: string,
  stockUnitId: string,
  preferredVendorId: string | null | undefined,
  costPrice: number | null | undefined,
  formData: FormData,
): Promise<{ error?: string } | void> {
  const parsed = restockOnSaveSchema.safeParse({
    restockQty: str(formData.get("restockQty")),
    restockPaidNow: str(formData.get("restockPaidNow")),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { restockQty, restockPaidNow } = parsed.data;
  if (!restockQty || restockQty <= 0 || !preferredVendorId) return;

  const result = await restockWithVendor(organization, userId, {
    productId,
    quantity: restockQty,
    unitId: stockUnitId,
    unitCost: costPrice ?? null,
    vendorId: preferredVendorId,
    paidNow: restockPaidNow,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${preferredVendorId}`);
  revalidatePath("/movements");
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    code: str(formData.get("code")),
    categoryId: str(formData.get("categoryId")),
    stockUnitId: formData.get("stockUnitId"),
    reorderLevel: formData.get("reorderLevel") || 0,
    costPrice: str(formData.get("costPrice")),
    preferredVendorId: str(formData.get("preferredVendorId")),
    notes: str(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createProduct(organization.id, parsed.data);
  if (!result.ok) return { error: result.error };
  const restock = await maybeRestockFromProductForm(
    organization,
    user.id,
    result.id,
    parsed.data.stockUnitId,
    parsed.data.preferredVendorId,
    parsed.data.costPrice,
    formData,
  );
  if (restock?.error) return { error: restock.error };
  revalidatePath("/products");
  redirect("/products");
}

export async function updateProductAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    code: str(formData.get("code")),
    categoryId: str(formData.get("categoryId")),
    stockUnitId: formData.get("stockUnitId"),
    reorderLevel: formData.get("reorderLevel") || 0,
    costPrice: str(formData.get("costPrice")),
    preferredVendorId: str(formData.get("preferredVendorId")),
    notes: str(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await updateProduct(organization.id, productId, parsed.data);
  if (!result.ok) return { error: result.error };
  const restock = await maybeRestockFromProductForm(
    organization,
    user.id,
    productId,
    parsed.data.stockUnitId,
    parsed.data.preferredVendorId,
    parsed.data.costPrice,
    formData,
  );
  if (restock?.error) return { error: restock.error };
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

export async function deleteProductAction(productId: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await db
    .delete(products)
    .where(
      and(eq(products.id, productId), eq(products.organizationId, organization.id)),
    );
  revalidatePath("/products");
  redirect("/products");
}

// --- Bulk actions ------------------------------------------------------

const idsSchema = z.array(z.string().uuid()).min(1, "Select at least one product");

export async function bulkDeleteProductsAction(ids: string[]): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .delete(products)
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  revalidatePath("/products");
  return { ok: true };
}

export async function bulkSetCategoryAction(
  ids: string[],
  categoryId: string | null,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .update(products)
    .set({ categoryId })
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  revalidatePath("/products");
  return { ok: true };
}

export async function bulkSetActiveAction(
  ids: string[],
  isActive: boolean,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .update(products)
    .set({ isActive })
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  revalidatePath("/products");
  return { ok: true };
}

export async function createCategoryAction(name: string): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const clean = name.trim();
  if (!clean) return { error: "Category name required" };
  try {
    await db
      .insert(categories)
      .values({ organizationId: organization.id, name: clean });
  } catch {
    return { error: "Category already exists" };
  }
  revalidatePath("/products/new");
  return { ok: true };
}

// --- Stock movements --------------------------------------------------------

const movementSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(["restock", "usage", "waste", "adjustment"]),
  quantity: z.coerce.number().positive("Enter a quantity greater than 0"),
  unitId: z.string().uuid("Choose a unit"),
  direction: z.enum(["increase", "decrease"]).optional(),
  expiryDate: z.string().optional().nullable(),
  unitCost: z.coerce.number().min(0).optional().nullable(),
  note: z.string().trim().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  paidNow: z.coerce.number().min(0).optional().nullable(),
});

export async function logMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization, user } = await requireAuth();
  const parsed = movementSchema.safeParse({
    productId: formData.get("productId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    unitId: formData.get("unitId"),
    direction: str(formData.get("direction")) ?? undefined,
    expiryDate: str(formData.get("expiryDate")),
    unitCost: str(formData.get("unitCost")),
    note: str(formData.get("note")),
    invoiceId: str(formData.get("invoiceId")) ?? undefined,
    vendorId: str(formData.get("vendorId")) ?? undefined,
    paidNow: str(formData.get("paidNow")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // Vendor picked on a restock — restock and wrap the new batch in a
  // one-line purchase bill so it shows up in the vendor's ledger.
  if (d.type === "restock" && d.vendorId) {
    const result = await restockWithVendor(organization, user.id, {
      productId: d.productId,
      quantity: d.quantity,
      unitId: d.unitId,
      unitCost: d.unitCost ?? null,
      expiryDate: d.expiryDate ?? null,
      vendorId: d.vendorId,
      paidNow: d.paidNow,
      note: d.note ?? null,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${d.vendorId}`);
  } else {
    const result = await applyMovement({
      organizationId: organization.id,
      productId: d.productId,
      type: d.type,
      quantity: d.quantity,
      unitId: d.unitId,
      userId: user.id,
      note: d.note ?? null,
      direction: d.direction,
      expiryDate: d.type === "restock" ? d.expiryDate ?? null : null,
      unitCost: d.type === "restock" ? d.unitCost ?? null : null,
      invoiceId:
        d.type === "usage" || d.type === "waste" ? d.invoiceId ?? null : null,
    });
    if (!result.ok) return { error: result.error };
  }

  revalidatePath(`/products/${d.productId}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/movements");
  return { ok: true };
}
