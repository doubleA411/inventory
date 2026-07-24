import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  products,
  units,
  stockBatches,
  stockMovements,
  type MovementType,
} from "@/lib/db/schema";
import { convertQuantity, roundQty } from "@/lib/units";

export type ApplyMovementInput = {
  organizationId: string;
  productId: string;
  type: MovementType;
  /** Quantity in the movement unit (always positive; sign comes from `type`). */
  quantity: number;
  /** The unit the quantity is expressed in (may differ from the stock unit). */
  unitId: string;
  userId?: string | null;
  note?: string | null;
  /** Restock only: optional expiry + received date for the created batch. */
  expiryDate?: string | null;
  receivedDate?: string | null;
  /** Adjustment only: whether the correction adds or removes stock. */
  direction?: "increase" | "decrease";
  /** Usage/waste: the bill/invoice this stock was consumed for (optional). */
  invoiceId?: string | null;
};

export type ApplyMovementResult =
  | { ok: true; balanceAfter: number; movementId: string }
  | { ok: false; error: string };

/** Does this movement add stock (create a batch) or remove it (FEFO draw)? */
function isIncrease(input: ApplyMovementInput): boolean {
  switch (input.type) {
    case "restock":
      return true;
    case "usage":
    case "waste":
      return false;
    case "adjustment":
      return (input.direction ?? "increase") === "increase";
  }
}

/**
 * Apply a stock movement atomically:
 *  - restock (+): creates a batch (with optional expiry), bumps stock
 *  - usage/waste (−): draws down batches FEFO (soonest expiry first)
 *  - adjustment (±): positive creates a no-expiry batch, negative draws FEFO
 *
 * All within one transaction. Product `currentStock` is recomputed from the
 * remaining batch quantities so it can never drift from the ledger.
 */
export async function applyMovement(
  input: ApplyMovementInput,
): Promise<ApplyMovementResult> {
  if (!(input.quantity > 0)) {
    return { ok: false, error: "Quantity must be greater than zero." };
  }

  try {
    return await db.transaction(async (tx) => {
      // Load product (tenant-scoped) + its stock unit + the movement unit.
      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (!product) return { ok: false as const, error: "Product not found." };

      const [stockUnit] = await tx
        .select()
        .from(units)
        .where(eq(units.id, product.stockUnitId))
        .limit(1);
      const [moveUnit] = await tx
        .select()
        .from(units)
        .where(
          and(
            eq(units.id, input.unitId),
            eq(units.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (!stockUnit || !moveUnit) {
        return { ok: false as const, error: "Unit not found." };
      }

      // Convert the movement quantity into the product's stock unit.
      let qtyInStock: number;
      try {
        qtyInStock = roundQty(
          convertQuantity(input.quantity, moveUnit, stockUnit),
        );
      } catch (e) {
        return {
          ok: false as const,
          error: e instanceof Error ? e.message : "Unit conversion failed.",
        };
      }

      let createdBatchId: string | null = null;
      let delta: number;

      if (isIncrease(input)) {
        // Additive: create a batch.
        delta = qtyInStock;
        const [batch] = await tx
          .insert(stockBatches)
          .values({
            organizationId: input.organizationId,
            productId: product.id,
            quantityRemaining: String(qtyInStock),
            expiryDate: input.expiryDate ?? null,
            receivedDate: input.receivedDate ?? undefined,
            note: input.note ?? null,
          })
          .returning();
        createdBatchId = batch.id;
      } else {
        // Subtractive (usage / waste): FEFO draw-down.
        delta = -qtyInStock;
        const batches = await tx
          .select()
          .from(stockBatches)
          .where(
            and(
              eq(stockBatches.productId, product.id),
              gt(stockBatches.quantityRemaining, "0"),
            ),
          )
          // FEFO: soonest expiry first (NULL expiry last), then oldest received.
          .orderBy(
            sql`${stockBatches.expiryDate} ASC NULLS LAST`,
            asc(stockBatches.receivedDate),
            asc(stockBatches.createdAt),
          );

        const available = roundQty(
          batches.reduce((s, b) => s + Number(b.quantityRemaining), 0),
        );
        if (qtyInStock > available + 1e-6) {
          return {
            ok: false as const,
            error: `Not enough stock. Available: ${available} ${stockUnit.symbol}, requested: ${qtyInStock} ${stockUnit.symbol}.`,
          };
        }

        let remaining = qtyInStock;
        for (const b of batches) {
          if (remaining <= 1e-9) break;
          const bRemaining = Number(b.quantityRemaining);
          const take = Math.min(bRemaining, remaining);
          const newRemaining = roundQty(bRemaining - take);
          remaining = roundQty(remaining - take);
          await tx
            .update(stockBatches)
            .set({ quantityRemaining: String(newRemaining) })
            .where(eq(stockBatches.id, b.id));
        }
      }

      // Recompute the running balance from remaining batch quantities — the
      // batches are the source of truth, so currentStock can never drift.
      const remainingBatches = await tx
        .select({ q: stockBatches.quantityRemaining })
        .from(stockBatches)
        .where(eq(stockBatches.productId, product.id));
      const balanceAfter = roundQty(
        remainingBatches.reduce((s, r) => s + Number(r.q), 0),
      );

      await tx
        .update(products)
        .set({ currentStock: String(balanceAfter) })
        .where(eq(products.id, product.id));

      // Cost snapshot from the product's cost price.
      const unitCost = product.costPrice != null ? Number(product.costPrice) : null;
      const costAmount =
        unitCost != null ? Math.round(Math.abs(qtyInStock) * unitCost * 100) / 100 : 0;

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          organizationId: input.organizationId,
          productId: product.id,
          type: input.type,
          quantity: String(input.quantity),
          unitId: input.unitId,
          deltaInStockUnit: String(roundQty(delta)),
          balanceAfter: String(balanceAfter),
          batchId: createdBatchId,
          userId: input.userId ?? null,
          note: input.note ?? null,
          unitCost: unitCost != null ? String(unitCost) : null,
          costAmount: String(costAmount),
          invoiceId: input.invoiceId ?? null,
        })
        .returning();

      return { ok: true as const, balanceAfter, movementId: movement.id };
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to apply movement.",
    };
  }
}

/** Recompute a product's currentStock from its batches (repair helper). */
export async function recomputeProductStock(productId: string): Promise<number> {
  const rows = await db
    .select({ q: stockBatches.quantityRemaining })
    .from(stockBatches)
    .where(eq(stockBatches.productId, productId));
  const total = roundQty(rows.reduce((s, r) => s + Number(r.q), 0));
  await db
    .update(products)
    .set({ currentStock: String(total) })
    .where(eq(products.id, productId));
  return total;
}
