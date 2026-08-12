import "server-only";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { purchaseLists, purchaseListItems, type Organization } from "@/lib/db/schema";
import { financialYear, formatDocNumber } from "@/lib/tax";

const purchaseListItemSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().optional().nullable(),
});

export const purchaseListSchema = z.object({
  vendorId: z.string().uuid(),
  listDate: z.string().min(1),
  notes: z.string().trim().optional().nullable(),
  items: z.array(purchaseListItemSchema),
});
export type PurchaseListInput = z.infer<typeof purchaseListSchema>;

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export async function createPurchaseListCore(
  org: Organization,
  userId: string,
  raw: PurchaseListInput,
): Promise<SaveResult> {
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = purchaseListSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one item." };
  }

  try {
    const id = await db.transaction(async (tx) => {
      const fy = financialYear();
      const [last] = await tx
        .select({ seq: purchaseLists.seq })
        .from(purchaseLists)
        .where(and(eq(purchaseLists.organizationId, org.id), eq(purchaseLists.fy, fy)))
        .orderBy(desc(purchaseLists.seq))
        .limit(1);
      const seq = (last?.seq ?? 0) + 1;
      const number = formatDocNumber(org.purchaseListPrefix, fy, seq);

      const [list] = await tx
        .insert(purchaseLists)
        .values({
          organizationId: org.id,
          number,
          seq,
          fy,
          vendorId: d.vendorId,
          listDate: d.listDate,
          notes: d.notes || null,
          createdBy: userId,
        })
        .returning();

      await tx.insert(purchaseListItems).values(
        d.items.map((i, idx) => ({
          purchaseListId: list.id,
          position: idx,
          productId: i.productId || null,
          description: i.description,
          quantity: String(i.quantity),
          unit: i.unit || null,
        })),
      );

      return list.id;
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the purchase list." };
  }
}

/** Drafts only — once sent, a list is kept as a record of what was actually
 * asked for and isn't rewritten (same append-only reasoning as purchase
 * bills). Replaces every item wholesale, simplest correct approach for a
 * document with no downstream effects (no stock, no ledger) to desync. */
export async function updatePurchaseListCore(
  orgId: string,
  id: string,
  raw: PurchaseListInput,
): Promise<SaveResult> {
  const cleaned = { ...raw, items: (raw.items ?? []).filter((i) => i.description?.trim()) };
  const parsed = purchaseListSchema.safeParse(cleaned);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.items.length === 0) {
    return { ok: false, error: "Add at least one item." };
  }

  const [existing] = await db
    .select({ status: purchaseLists.status })
    .from(purchaseLists)
    .where(and(eq(purchaseLists.id, id), eq(purchaseLists.organizationId, orgId)))
    .limit(1);
  if (!existing) return { ok: false, error: "Purchase list not found." };
  if (existing.status !== "draft") {
    return { ok: false, error: "Only drafts can be edited." };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(purchaseLists)
        .set({ vendorId: d.vendorId, listDate: d.listDate, notes: d.notes || null })
        .where(eq(purchaseLists.id, id));
      await tx.delete(purchaseListItems).where(eq(purchaseListItems.purchaseListId, id));
      await tx.insert(purchaseListItems).values(
        d.items.map((i, idx) => ({
          purchaseListId: id,
          position: idx,
          productId: i.productId || null,
          description: i.description,
          quantity: String(i.quantity),
          unit: i.unit || null,
        })),
      );
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Could not save the purchase list." };
  }
}

/** Clones an existing list (any status) into a fresh draft for the same
 * vendor, same items/quantities — the recurring-order shortcut. */
export async function duplicatePurchaseListCore(
  org: Organization,
  userId: string,
  id: string,
): Promise<SaveResult> {
  const [source] = await db
    .select()
    .from(purchaseLists)
    .where(and(eq(purchaseLists.id, id), eq(purchaseLists.organizationId, org.id)))
    .limit(1);
  if (!source) return { ok: false, error: "Purchase list not found." };
  if (!source.vendorId) return { ok: false, error: "Original list has no vendor." };
  const items = await db
    .select()
    .from(purchaseListItems)
    .where(eq(purchaseListItems.purchaseListId, id));

  return createPurchaseListCore(org, userId, {
    vendorId: source.vendorId,
    listDate: new Date().toISOString().slice(0, 10),
    notes: source.notes,
    items: items.map((i) => ({
      productId: i.productId,
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
    })),
  });
}

export async function markPurchaseListSentCore(orgId: string, id: string): Promise<void> {
  await db
    .update(purchaseLists)
    .set({ status: "sent" })
    .where(and(eq(purchaseLists.id, id), eq(purchaseLists.organizationId, orgId)));
}

export async function deletePurchaseListCore(orgId: string, id: string): Promise<void> {
  await db
    .delete(purchaseLists)
    .where(and(eq(purchaseLists.id, id), eq(purchaseLists.organizationId, orgId)));
}
