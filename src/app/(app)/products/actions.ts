"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, categories } from "@/lib/db/schema";
import { requireAuth, requireRole } from "@/lib/auth";
import { applyMovement } from "@/lib/stock";
import { productSchema, createProduct, updateProduct } from "@/lib/products";

export type ActionState = { error?: string; ok?: boolean };

function str(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

export async function createProductAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    code: str(formData.get("code")),
    categoryId: str(formData.get("categoryId")),
    stockUnitId: formData.get("stockUnitId"),
    reorderLevel: formData.get("reorderLevel") || 0,
    costPrice: str(formData.get("costPrice")),
    notes: str(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createProduct(organization.id, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/products");
  redirect("/products");
}

export async function updateProductAction(
  productId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    code: str(formData.get("code")),
    categoryId: str(formData.get("categoryId")),
    stockUnitId: formData.get("stockUnitId"),
    reorderLevel: formData.get("reorderLevel") || 0,
    costPrice: str(formData.get("costPrice")),
    notes: str(formData.get("notes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await updateProduct(organization.id, productId, parsed.data);
  if (!result.ok) return { error: result.error };
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
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
  revalidatePath(`/products/${d.productId}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/movements");
  return { ok: true };
}
