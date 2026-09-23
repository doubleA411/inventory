import "server-only";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { foreignRefError } from "@/lib/tenant";
import { products, stockBatches, stockMovements, units } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { convertQuantity, convertUnitCost, roundQty } from "@/lib/units";

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
export type ProductResult =
  | { ok: true; id: string; costPrice: number | null }
  | { ok: false; error: string };

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** A product's unit, category and preferred vendor must all be this org's own. */
function productRefError(organizationId: string, input: ProductInput) {
  return foreignRefError(organizationId, {
    unit: input.stockUnitId,
    category: input.categoryId,
    vendor: input.preferredVendorId,
  });
}

export async function createProduct(
  organizationId: string,
  input: ProductInput,
): Promise<ProductResult> {
  const refError = await productRefError(organizationId, input);
  if (refError) return { ok: false, error: refError };
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
    return { ok: true, id: row.id, costPrice: input.costPrice ?? null };
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
  const refError = await productRefError(organizationId, input);
  if (refError) return { ok: false, error: refError };
  try {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)))
        .limit(1);
      if (!current) return { ok: false as const, error: "Product not found." };

      const unitChanged = current.stockUnitId !== input.stockUnitId;
      let reorderLevel = input.reorderLevel;
      let costPrice = input.costPrice ?? null;
      let currentStock = Number(current.currentStock);

      if (unitChanged) {
        const selectedUnits = await tx
          .select()
          .from(units)
          .where(and(eq(units.organizationId, organizationId)));
        const fromUnit = selectedUnits.find((unit) => unit.id === current.stockUnitId);
        const toUnit = selectedUnits.find((unit) => unit.id === input.stockUnitId);
        if (!fromUnit || !toUnit) {
          return { ok: false as const, error: "The selected stock unit was not found." };
        }
        if (fromUnit.groupId !== toUnit.groupId) {
          return {
            ok: false as const,
            error: `${fromUnit.name} and ${toUnit.name} are different unit types and cannot be converted automatically.`,
          };
        }

        reorderLevel = roundQty(convertQuantity(input.reorderLevel, fromUnit, toUnit));
        costPrice =
          input.costPrice != null
            ? roundMoney(convertUnitCost(input.costPrice, fromUnit, toUnit))
            : null;
        currentStock = roundQty(convertQuantity(currentStock, fromUnit, toUnit));

        const batches = await tx
          .select()
          .from(stockBatches)
          .where(eq(stockBatches.productId, productId));
        for (const batch of batches) {
          const quantityRemaining = roundQty(
            convertQuantity(Number(batch.quantityRemaining), fromUnit, toUnit),
          );
          const unitCost =
            batch.unitCost != null
              ? roundMoney(convertUnitCost(Number(batch.unitCost), fromUnit, toUnit))
              : null;
          await tx
            .update(stockBatches)
            .set({ quantityRemaining: String(quantityRemaining), unitCost: unitCost != null ? String(unitCost) : null })
            .where(eq(stockBatches.id, batch.id));
        }

        const movements = await tx
          .select()
          .from(stockMovements)
          .where(eq(stockMovements.productId, productId));
        for (const movement of movements) {
          const deltaInStockUnit = roundQty(
            convertQuantity(Number(movement.deltaInStockUnit), fromUnit, toUnit),
          );
          const balanceAfter = roundQty(
            convertQuantity(Number(movement.balanceAfter), fromUnit, toUnit),
          );
          const unitCost =
            movement.unitCost != null
              ? roundMoney(convertUnitCost(Number(movement.unitCost), fromUnit, toUnit))
              : null;
          await tx
            .update(stockMovements)
            .set({
              deltaInStockUnit: String(deltaInStockUnit),
              balanceAfter: String(balanceAfter),
              unitCost: unitCost != null ? String(unitCost) : null,
            })
            .where(eq(stockMovements.id, movement.id));
        }
      }

      await tx
        .update(products)
        .set({
          name: input.name,
          code: input.code ?? null,
          categoryId: input.categoryId ?? null,
          stockUnitId: input.stockUnitId,
          currentStock: String(currentStock),
          reorderLevel: String(reorderLevel),
          costPrice: costPrice != null ? String(costPrice) : null,
          preferredVendorId: input.preferredVendorId ?? null,
          notes: input.notes ?? null,
        })
        .where(and(eq(products.id, productId), eq(products.organizationId, organizationId)));
      return { ok: true as const, id: productId, costPrice };
    });
  } catch (e) {
    if (isUniqueViolation(e, "products_org_code_uq")) {
      return { ok: false, error: "A product with that code already exists." };
    }
    return { ok: false, error: "Could not update product." };
  }
}
