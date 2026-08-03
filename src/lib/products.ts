import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  stockUnitId: z.string().uuid("Choose a unit"),
  reorderLevel: z.coerce.number().min(0).default(0),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  preferredVendorId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductResult = { ok: true; id: string } | { ok: false; error: string };

export async function createProduct(
  organizationId: string,
  input: ProductInput,
): Promise<ProductResult> {
  try {
    const [row] = await db
      .insert(products)
      .values({
        organizationId,
        name: input.name,
        code: input.code ?? null,
        categoryId: input.categoryId ?? null,
        stockUnitId: input.stockUnitId,
        reorderLevel: String(input.reorderLevel),
        costPrice: input.costPrice != null ? String(input.costPrice) : null,
        preferredVendorId: input.preferredVendorId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return { ok: true, id: row.id };
  } catch (e) {
    if (isUniqueViolation(e, "products_org_code_uq")) {
      return { ok: false, error: "A product with that code already exists." };
    }
    return { ok: false, error: "Could not create product." };
  }
}

export async function updateProduct(
  organizationId: string,
  productId: string,
  input: ProductInput,
): Promise<ProductResult> {
  try {
    await db
      .update(products)
      .set({
        name: input.name,
        code: input.code ?? null,
        categoryId: input.categoryId ?? null,
        stockUnitId: input.stockUnitId,
        reorderLevel: String(input.reorderLevel),
        costPrice: input.costPrice != null ? String(input.costPrice) : null,
        preferredVendorId: input.preferredVendorId ?? null,
        notes: input.notes ?? null,
      })
      .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)));
    return { ok: true, id: productId };
  } catch (e) {
    if (isUniqueViolation(e, "products_org_code_uq")) {
      return { ok: false, error: "A product with that code already exists." };
    }
    return { ok: false, error: "Could not update product." };
  }
}
