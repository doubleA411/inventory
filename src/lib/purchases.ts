import "server-only";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  purchaseBills,
  purchaseBillItems,
  purchaseBillPayments,
  stockBatches,
  stockMovements,
  products,
  units,
  type Organization,
} from "@/lib/db/schema";
import { applyMovement } from "@/lib/stock";
import { financialYear, formatDocNumber } from "@/lib/tax";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const purchaseBillItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("product"),
    productId: z.string().uuid(),
    description: z.string().trim().min(1),
    quantity: z.coerce.number().positive(),
    unitId: z.string().uuid(),
    unit: z.string().trim().min(1), // symbol, for display/printing
    rate: z.coerce.number().min(0),
  }),
  z.object({
    kind: z.literal("charge"),
    description: z.string().trim().min(1),
    amount: z.coerce.number().min(0),
  }),
]);

export const purchaseBillSchema = z.object({
  vendorId: z.string().uuid().nullable().optional(),
  billDate: z.string().min(1),
  notes: z.string().trim().optional().nullable(),
  items: z.array(purchaseBillItemSchema),
});
export type PurchaseBillInput = z.infer<typeof purchaseBillSchema>;

export type SaveResult =
  | { ok: true; id: string; stockErrors?: string[] }
  | { ok: false; error: string };

/**
 * Purchase bills are append-only, like the stock ledger they feed — no edit
 * after creation. Line items directly create stock batches; letting an edit
 * silently rewrite a batch that's already been partly used elsewhere would
 * corrupt the FEFO ledger. Mistakes get cancelled (kept for the record,
 * excluded from totals), not rewritten.
 */
export async function createPurchaseBillCore(
  org: Organization,
  userId: string,
  raw: PurchaseBillInput,
): Promise<SaveResult> {
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = purchaseBillSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one line item." };
  }

  const lineAmounts = d.items.map((i) =>
    i.kind === "product" ? round2(i.quantity * i.rate) : round2(i.amount),
  );
  const total = round2(lineAmounts.reduce((s, a) => s + a, 0));

  let billId: string;
  let itemIds: string[];
  try {
    const result = await db.transaction(async (tx) => {
      const fy = financialYear();
      const [last] = await tx
        .select({ seq: purchaseBills.seq })
        .from(purchaseBills)
        .where(and(eq(purchaseBills.organizationId, org.id), eq(purchaseBills.fy, fy)))
        .orderBy(desc(purchaseBills.seq))
        .limit(1);
      const seq = (last?.seq ?? 0) + 1;
      const number = formatDocNumber(org.purchaseBillPrefix, fy, seq);

      const [bill] = await tx
        .insert(purchaseBills)
        .values({
          organizationId: org.id,
          number,
          seq,
          fy,
          vendorId: d.vendorId ?? null,
          billDate: d.billDate,
          subtotal: String(total),
          total: String(total),
          notes: d.notes || null,
          createdBy: userId,
        })
        .returning();

      const items = await tx
        .insert(purchaseBillItems)
        .values(
          d.items.map((i, idx) => ({
            purchaseBillId: bill.id,
            position: idx,
            productId: i.kind === "product" ? i.productId : null,
            description: i.description,
            quantity: i.kind === "product" ? String(i.quantity) : "1",
            unit: i.kind === "product" ? i.unit : null,
            rate: i.kind === "product" ? String(i.rate) : String(lineAmounts[idx]),
            amount: String(lineAmounts[idx]),
          })),
        )
        .returning({ id: purchaseBillItems.id });

      return { billId: bill.id, itemIds: items.map((r) => r.id) };
    });
    billId = result.billId;
    itemIds = result.itemIds;
  } catch {
    return { ok: false, error: "Could not save the purchase bill." };
  }

  // Product lines each create a stock batch (same mechanics as a manual
  // restock) — done after the bill commits, one independent movement per
  // line, same risk profile as any other restock through this app.
  const stockErrors: string[] = [];
  for (let idx = 0; idx < d.items.length; idx++) {
    const item = d.items[idx];
    if (item.kind !== "product") continue;
    const result = await applyMovement({
      organizationId: org.id,
      productId: item.productId,
      type: "restock",
      quantity: item.quantity,
      unitId: item.unitId,
      userId,
      note: `Purchase bill`,
      unitCost: item.rate,
    });
    if (!result.ok) {
      stockErrors.push(`${item.description}: ${result.error}`);
      continue;
    }
    const [movement] = await db
      .select({ batchId: stockMovements.batchId })
      .from(stockMovements)
      .where(eq(stockMovements.id, result.movementId))
      .limit(1);
    if (movement?.batchId) {
      await db
        .update(stockBatches)
        .set({ purchaseBillItemId: itemIds[idx] })
        .where(eq(stockBatches.id, movement.batchId));
    }
  }

  return { ok: true, id: billId, stockErrors: stockErrors.length ? stockErrors : undefined };
}

export async function cancelPurchaseBillCore(orgId: string, id: string): Promise<void> {
  await db
    .update(purchaseBills)
    .set({ status: "cancelled" })
    .where(and(eq(purchaseBills.id, id), eq(purchaseBills.organizationId, orgId)));
}

export async function deletePurchaseBillCore(orgId: string, id: string): Promise<void> {
  await db
    .delete(purchaseBills)
    .where(and(eq(purchaseBills.id, id), eq(purchaseBills.organizationId, orgId)));
}

const purchaseBillPaymentSchema = z.object({
  purchaseBillId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount greater than 0"),
  method: z.enum(["cash", "upi", "bank_transfer", "cheque", "card", "other"]),
  reference: z.string().trim().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  note: z.string().trim().optional().nullable(),
});
export type PurchaseBillPaymentInput = z.infer<typeof purchaseBillPaymentSchema>;

export async function recordPurchaseBillPaymentCore(
  orgId: string,
  userId: string,
  raw: PurchaseBillPaymentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = purchaseBillPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const [bill] = await db
    .select()
    .from(purchaseBills)
    .where(and(eq(purchaseBills.id, d.purchaseBillId), eq(purchaseBills.organizationId, orgId)))
    .limit(1);
  if (!bill) return { ok: false, error: "Purchase bill not found." };

  await db.transaction(async (tx) => {
    await tx.insert(purchaseBillPayments).values({
      organizationId: orgId,
      purchaseBillId: d.purchaseBillId,
      amount: String(d.amount),
      method: d.method,
      reference: d.reference || null,
      paidAt: d.paidAt || undefined,
      note: d.note || null,
      createdBy: userId,
    });
    const newPaid = Number(bill.amountPaid) + d.amount;
    await tx
      .update(purchaseBills)
      .set({ amountPaid: String(newPaid) })
      .where(eq(purchaseBills.id, d.purchaseBillId));
  });

  return { ok: true };
}

/**
 * Vendor tracking for the restock quick-path: the stock batch already exists
 * (created by the normal applyMovement restock flow) — this just links it
 * into a purchase bill for the vendor. Restocking several products from the
 * same vendor on the same day should land as multiple lines on one bill
 * (matching how a real supplier invoice works), not a separate bill per
 * product — so this appends to today's still-active bill for that vendor if
 * one already exists, and only creates a new bill otherwise. Called right
 * after a successful restock when a vendor was picked in the dialog.
 */
export async function createPurchaseBillForRestockCore(
  org: Organization,
  userId: string,
  input: {
    vendorId: string;
    productId: string;
    description: string;
    quantity: number;
    unit: string;
    rate: number;
    batchId: string;
    paidNow?: number | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const amount = round2(input.quantity * input.rate);
  const billDate = new Date().toISOString().slice(0, 10);
  let billId: string;
  try {
    billId = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: purchaseBills.id, total: purchaseBills.total, subtotal: purchaseBills.subtotal })
        .from(purchaseBills)
        .where(
          and(
            eq(purchaseBills.organizationId, org.id),
            eq(purchaseBills.vendorId, input.vendorId),
            eq(purchaseBills.billDate, billDate),
            eq(purchaseBills.status, "active"),
          ),
        )
        .orderBy(desc(purchaseBills.createdAt))
        .limit(1);

      let bill: { id: string };
      let position = 0;
      if (existing) {
        bill = existing;
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(purchaseBillItems)
          .where(eq(purchaseBillItems.purchaseBillId, existing.id));
        position = count;
        const newTotal = round2(Number(existing.total) + amount);
        await tx
          .update(purchaseBills)
          .set({ subtotal: String(newTotal), total: String(newTotal) })
          .where(eq(purchaseBills.id, existing.id));
      } else {
        const fy = financialYear();
        const [last] = await tx
          .select({ seq: purchaseBills.seq })
          .from(purchaseBills)
          .where(and(eq(purchaseBills.organizationId, org.id), eq(purchaseBills.fy, fy)))
          .orderBy(desc(purchaseBills.seq))
          .limit(1);
        const seq = (last?.seq ?? 0) + 1;
        const number = formatDocNumber(org.purchaseBillPrefix, fy, seq);

        const [created] = await tx
          .insert(purchaseBills)
          .values({
            organizationId: org.id,
            number,
            seq,
            fy,
            vendorId: input.vendorId,
            billDate,
            subtotal: String(amount),
            total: String(amount),
            createdBy: userId,
          })
          .returning();
        bill = created;
      }

      const [item] = await tx
        .insert(purchaseBillItems)
        .values({
          purchaseBillId: bill.id,
          position,
          productId: input.productId,
          description: input.description,
          quantity: String(input.quantity),
          unit: input.unit,
          rate: String(input.rate),
          amount: String(amount),
        })
        .returning();

      await tx
        .update(stockBatches)
        .set({ purchaseBillItemId: item.id })
        .where(eq(stockBatches.id, input.batchId));

      return bill.id;
    });
  } catch {
    return { ok: false, error: "Restock saved, but the vendor bill could not be created." };
  }

  if (input.paidNow && input.paidNow > 0) {
    await recordPurchaseBillPaymentCore(org.id, userId, {
      purchaseBillId: billId,
      amount: input.paidNow,
      method: "cash",
      paidAt: new Date().toISOString().slice(0, 10),
    });
  }

  return { ok: true, id: billId };
}

/**
 * Restock a product and wrap the new batch in a one-line purchase bill for
 * the given vendor in one step. Shared by the Restock quick-path and the
 * product form's inline "log a purchase" fields.
 */
export async function restockWithVendor(
  org: Organization,
  userId: string,
  input: {
    productId: string;
    quantity: number;
    unitId: string;
    unitCost?: number | null;
    expiryDate?: string | null;
    vendorId: string;
    paidNow?: number | null;
    note?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const movement = await applyMovement({
    organizationId: org.id,
    productId: input.productId,
    type: "restock",
    quantity: input.quantity,
    unitId: input.unitId,
    userId,
    note: input.note ?? null,
    unitCost: input.unitCost ?? null,
    expiryDate: input.expiryDate ?? null,
  });
  if (!movement.ok) return movement;

  const [product] = await db
    .select({ name: products.name })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);
  const [unit] = await db
    .select({ symbol: units.symbol })
    .from(units)
    .where(eq(units.id, input.unitId))
    .limit(1);
  const [batchRow] = await db
    .select({ batchId: stockMovements.batchId })
    .from(stockMovements)
    .where(eq(stockMovements.id, movement.movementId))
    .limit(1);
  if (!product || !unit || !batchRow?.batchId) {
    return { ok: false, error: "Restock saved, but the vendor bill could not be created." };
  }

  const bill = await createPurchaseBillForRestockCore(org, userId, {
    vendorId: input.vendorId,
    productId: input.productId,
    description: product.name,
    quantity: input.quantity,
    unit: unit.symbol,
    rate: input.unitCost ?? 0,
    batchId: batchRow.batchId,
    paidNow: input.paidNow,
  });
  if (!bill.ok) return bill;
  return { ok: true };
}
