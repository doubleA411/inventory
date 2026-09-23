"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { products, categories, stockBatches, stockMovements } from "@/lib/db/schema";
import { requireAuth, requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { fmtMoney } from "@/lib/utils";
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
  return stockOnSave(organization, userId, {
    productId,
    stockUnitId,
    quantity: restockQty,
    unitCost: costPrice,
    vendorId: preferredVendorId,
    paidNow: restockPaidNow,
  });
}

/**
 * Put opening stock on a product as part of saving it.
 *
 * "I bought 5 kg of paneer" is one action, and it used to take three: create
 * the product, find it again in a list of ninety, then restock it. This is the
 * same restock path either way — with a vendor it also raises the purchase
 * bill, without one it just creates the batch, so tracking a supplier stays
 * optional rather than being the price of entry.
 */
async function stockOnSave(
  organization: Parameters<typeof restockWithVendor>[0],
  userId: string,
  input: {
    productId: string;
    stockUnitId: string;
    quantity?: number | null;
    unitCost?: number | null;
    vendorId?: string | null;
    paidNow?: number | null;
  },
): Promise<{ error?: string } | void> {
  const { quantity, unitCost, vendorId } = input;
  if (!quantity || quantity <= 0) return;
  // A blank cost is allowed everywhere else stock goes in, so it is allowed
  // here too — except against a vendor, where the bill needs a line amount.
  if (vendorId && unitCost == null) {
    return { error: "Enter a cost price to record this as a purchase from a vendor." };
  }

  if (vendorId) {
    const result = await restockWithVendor(organization, userId, {
      productId: input.productId,
      quantity,
      unitId: input.stockUnitId,
      unitCost,
      vendorId,
      paidNow: input.paidNow,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${vendorId}`);
  } else {
    const result = await applyMovement({
      organizationId: organization.id,
      productId: input.productId,
      type: "restock",
      quantity,
      unitId: input.stockUnitId,
      userId,
      unitCost,
    });
    if (!result.ok) return { error: result.error };
  }
  revalidatePath("/movements");
  revalidatePath("/dashboard");
}

/**
 * Non-redirecting create, for the "Add product" drawer on the products
 * list — the drawer stays open on error and just closes + refreshes on
 * success, so it can't use the redirect-on-success form-action pattern the
 * edit page's ProductForm relies on.
 */
export async function createProductQuick(
  input: {
    name: string;
    code?: string | null;
    categoryId?: string | null;
    stockUnitId: string;
    reorderLevel?: number;
    costPrice?: number | null;
    preferredVendorId?: string | null;
    notes?: string | null;
  },
  /** Optional opening stock, so buying something new is one step, not three. */
  opening?: { quantity?: number | null; paidNow?: number | null },
): Promise<
  | { ok: true; id: string; stockError?: string }
  | { ok: false; error: string }
> {
  const { organization, user } = await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createProduct(organization.id, parsed.data);
  if (!result.ok) return result;
  await recordAudit({
    orgId: organization.id,
    action: "product.created",
    entityType: "product",
    entityId: result.id,
    summary: `Created product ${parsed.data.name}`,
    actorUserId: user.id,
  });

  // Reported separately rather than failing the whole call: the product itself
  // saved fine, and telling someone "could not create product" when it exists
  // would send them off to create a duplicate.
  const stock = await stockOnSave(organization, user.id, {
    productId: result.id,
    stockUnitId: parsed.data.stockUnitId,
    quantity: opening?.quantity,
    unitCost: parsed.data.costPrice,
    vendorId: parsed.data.preferredVendorId,
    paidNow: opening?.paidNow,
  });

  revalidatePath("/products");
  return { ok: true, id: result.id, stockError: stock?.error };
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
  await recordAudit({
    orgId: organization.id,
    action: "product.updated",
    entityType: "product",
    entityId: productId,
    summary: `Updated product ${parsed.data.name}`,
    details: { costPrice: result.costPrice ?? null, reorderLevel: parsed.data.reorderLevel },
    actorUserId: user.id,
  });
  const restock = await maybeRestockFromProductForm(
    organization,
    user.id,
    productId,
    parsed.data.stockUnitId,
    parsed.data.preferredVendorId,
    result.costPrice,
    formData,
  );
  if (restock?.error) return { error: restock.error };
  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}`);
}

export async function deleteProductAction(productId: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await db
    .update(products)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(
      and(eq(products.id, productId), eq(products.organizationId, organization.id)),
    );
  await recordAudit({
    orgId: organization.id,
    action: "product.archived",
    entityType: "product",
    entityId: productId,
    summary: "Archived product",
    actorUserId: user.id,
  });
  revalidatePath("/products");
  redirect("/products");
}

// --- Bulk actions ------------------------------------------------------

/** One event per product, so each product's history stays complete. */
async function bulkProductAudit(
  orgId: string,
  userId: string,
  ids: string[],
  action: string,
  summary: string,
  details?: Record<string, unknown>,
) {
  for (const id of ids) {
    await recordAudit({
      orgId,
      action,
      entityType: "product",
      entityId: id,
      summary,
      details: { ...details, bulkCount: ids.length },
      actorUserId: userId,
    });
  }
}

const idsSchema = z.array(z.string().uuid()).min(1, "Select at least one product");

export async function bulkDeleteProductsAction(ids: string[]): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .update(products)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  await bulkProductAudit(organization.id, user.id, parsed.data, "product.archived", "Archived product (bulk)");
  revalidatePath("/products");
  return { ok: true };
}

export async function bulkSetCategoryAction(
  ids: string[],
  categoryId: string | null,
): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .update(products)
    .set({ categoryId })
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  await bulkProductAudit(organization.id, user.id, parsed.data, "product.category_changed", "Changed category (bulk)", { categoryId });
  revalidatePath("/products");
  return { ok: true };
}

export async function bulkSetActiveAction(
  ids: string[],
  isActive: boolean,
): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  await db
    .update(products)
    .set({ isActive })
    .where(
      and(inArray(products.id, parsed.data), eq(products.organizationId, organization.id)),
    );
  await bulkProductAudit(
    organization.id,
    user.id,
    parsed.data,
    isActive ? "product.activated" : "product.deactivated",
    isActive ? "Marked active (bulk)" : "Marked inactive (bulk)",
  );
  revalidatePath("/products");
  return { ok: true };
}

export async function createCategoryAction(name: string): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const clean = name.trim();
  if (!clean) return { error: "Category name required" };
  try {
    await db
      .insert(categories)
      .values({ organizationId: organization.id, name: clean });
  } catch {
    return { error: "Category already exists" };
  }
  await recordAudit({
    orgId: organization.id,
    action: "category.created",
    entityType: "category",
    entityLabel: clean,
    summary: `Created product category ${clean}`,
    actorUserId: user.id,
  });
  revalidatePath("/products");
  return { ok: true };
}

// --- Stock movements --------------------------------------------------------

const movementSchema = z
  .object({
    productId: z.string().uuid(),
    type: z.enum(["restock", "usage", "waste", "adjustment"]),
    quantity: z.coerce.number().positive("Enter a quantity greater than 0"),
    unitId: z.string().uuid("Choose a unit"),
    direction: z.enum(["increase", "decrease"]).optional(),
    expiryDate: z.string().optional().nullable(),
    unitCost: z.coerce.number().min(0).optional().nullable(),
    note: z.string().trim().optional().nullable(),
    invoiceId: z.string().uuid().optional().nullable(),
    quotationId: z.string().uuid().optional().nullable(),
    vendorId: z.string().uuid().optional().nullable(),
    paidNow: z.coerce.number().min(0).optional().nullable(),
  })
  .superRefine((d, ctx) => {
    // A cost is no longer demanded up front: goods often arrive before the
    // vendor's bill, and refusing the entry left the kitchen holding stock the
    // app knew nothing about. The valuation concern that motivated this is
    // handled at the source instead — applyMovement stores no cost rather than
    // borrowing the product's last one, so the gap is visible and fixable via
    // setBatchCostAction rather than silently wrong. A cost that IS given must
    // still be a real number.
    if (d.type === "restock" && d.unitCost != null && Number.isNaN(d.unitCost)) {
      ctx.addIssue({
        code: "custom",
        path: ["unitCost"],
        message: "Enter a valid cost per unit, or leave it blank.",
      });
    }
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
    quotationId: str(formData.get("quotationId")) ?? undefined,
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
      quotationId:
        d.type === "usage" || d.type === "waste" ? d.quotationId ?? null : null,
    });
    if (!result.ok) return { error: result.error };
  }

  revalidatePath(`/products/${d.productId}`);
  revalidatePath("/products");
  revalidatePath("/dashboard");
  revalidatePath("/movements");
  return { ok: true };
}

const batchCostSchema = z.object({
  batchId: z.string().uuid(),
  unitCost: z.coerce.number().min(0, "Enter a cost of 0 or more."),
});

/**
 * Fill in a batch's cost once the vendor's bill turns up.
 *
 * Stock can now be logged before its price is known, which would be a trap on
 * its own — the figure has to be settable later or those batches stay
 * unpriced for good. Only the cost is touched; quantities and the FEFO order
 * are left exactly as they are.
 */
export async function setBatchCostAction(
  batchId: string,
  unitCost: number,
): Promise<ActionState> {
  const { organization, user } = await requireRole("admin");
  const parsed = batchCostSchema.safeParse({ batchId, unitCost });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [batch] = await db
    .select({ id: stockBatches.id, productId: stockBatches.productId })
    .from(stockBatches)
    .innerJoin(products, eq(stockBatches.productId, products.id))
    .where(
      and(
        eq(stockBatches.id, parsed.data.batchId),
        eq(products.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!batch) return { error: "That batch no longer exists." };

  const cost = parsed.data.unitCost;
  await db
    .update(stockBatches)
    .set({ unitCost: String(cost) })
    .where(eq(stockBatches.id, batch.id));

  // Keep the restock line in Stock history agreeing with the batch it created.
  // It's the one movement genuinely tied to this batch (stockMovements.batchId
  // is set only on the restock that made it), so it can be corrected exactly.
  // Draws are a different matter: usage spans several batches and records no
  // batch link, so already-used stock keeps the cost it was valued at then.
  const [restock] = await db
    .select({ id: stockMovements.id, delta: stockMovements.deltaInStockUnit })
    .from(stockMovements)
    .where(and(eq(stockMovements.batchId, batch.id), eq(stockMovements.type, "restock")))
    .limit(1);
  if (restock) {
    const qty = Math.abs(Number(restock.delta));
    await db
      .update(stockMovements)
      .set({
        unitCost: String(cost),
        costAmount: String(Math.round(qty * cost * 100) / 100),
      })
      .where(eq(stockMovements.id, restock.id));
  }

  // If this is the product's newest batch, its price is now the best answer to
  // "what does this cost" — so the figure that pre-fills the next restock
  // follows it. An older batch being corrected leaves that alone.
  const [newest] = await db
    .select({ id: stockBatches.id })
    .from(stockBatches)
    .where(eq(stockBatches.productId, batch.productId))
    .orderBy(desc(stockBatches.receivedDate), desc(stockBatches.createdAt))
    .limit(1);
  if (newest?.id === batch.id) {
    await db
      .update(products)
      .set({ costPrice: String(cost) })
      .where(eq(products.id, batch.productId));
  }

  await recordAudit({
    orgId: organization.id,
    action: "stock.batch_cost_set",
    entityType: "product",
    entityId: batch.productId,
    summary: `Set batch cost to ${fmtMoney(cost)} per unit`,
    details: { batchId: batch.id, unitCost: cost },
    actorUserId: user.id,
  });
  revalidatePath(`/products/${batch.productId}`);
  revalidatePath("/products");
  return { ok: true };
}
