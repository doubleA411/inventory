"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { units, unitGroups, products, stockMovements } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/db-errors";

export type ActionState = { error?: string; ok?: boolean };

const unitSchema = z.object({
  groupId: z.string().uuid("Choose a unit type"),
  name: z.string().trim().min(1, "Name required"),
  symbol: z.string().trim().min(1, "Symbol required"),
  factorToBase: z.coerce.number().positive("Factor must be > 0"),
});

export async function createUnitAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = unitSchema.safeParse({
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    symbol: formData.get("symbol"),
    factorToBase: formData.get("factorToBase"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  // Ensure the group belongs to this org.
  const [group] = await db
    .select()
    .from(unitGroups)
    .where(
      and(eq(unitGroups.id, d.groupId), eq(unitGroups.organizationId, organization.id)),
    )
    .limit(1);
  if (!group) return { error: "Unit type not found." };

  try {
    await db.insert(units).values({
      organizationId: organization.id,
      groupId: d.groupId,
      name: d.name,
      symbol: d.symbol,
      factorToBase: String(d.factorToBase),
      isBase: false,
    });
  } catch (e) {
    if (isUniqueViolation(e, "units_org_symbol_uq")) {
      return { error: `A unit with symbol "${d.symbol}" already exists.` };
    }
    return { error: "Could not create unit." };
  }
  revalidatePath("/units");
  return { ok: true };
}

export async function createUnitGroupAction(name: string): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const clean = name.trim();
  if (!clean) return { error: "Type name required" };
  try {
    await db
      .insert(unitGroups)
      .values({ organizationId: organization.id, name: clean });
  } catch {
    return { error: "That unit type already exists" };
  }
  revalidatePath("/units");
  return { ok: true };
}

export async function deleteUnitAction(unitId: string): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  // Block deletion if the unit is in use (as a stock unit or in movements).
  const usedByProduct = await db
    .select({ id: products.id })
    .from(products)
    .where(
      and(eq(products.stockUnitId, unitId), eq(products.organizationId, organization.id)),
    )
    .limit(1);
  if (usedByProduct.length) {
    return { error: "Can't delete — a product uses this as its stock unit." };
  }
  const usedInMovement = await db
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(eq(stockMovements.unitId, unitId))
    .limit(1);
  if (usedInMovement.length) {
    return { error: "Can't delete — this unit appears in stock history." };
  }
  await db
    .delete(units)
    .where(and(eq(units.id, unitId), eq(units.organizationId, organization.id)));
  revalidatePath("/units");
  return { ok: true };
}
