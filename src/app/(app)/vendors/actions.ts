"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { TAMIL_NADU_CODE } from "@/lib/india-states";

export type VendorState = { error?: string; ok?: boolean; id?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Vendor name is required"),
  gstin: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  district: z.string().trim().optional(),
  location: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

export type VendorInput = z.infer<typeof schema>;

export async function saveVendor(
  input: VendorInput & { id?: string },
): Promise<VendorState> {
  const { organization } = await requireRole("admin");
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const values = {
    name: d.name,
    gstin: d.gstin || null,
    addressLine: d.addressLine || null,
    district: d.district?.trim() || "Chennai",
    location: d.location || null,
    stateCode: TAMIL_NADU_CODE,
    pincode: d.pincode || null,
    phone: d.phone || null,
    email: d.email || null,
    notes: d.notes || null,
  };

  if (input.id) {
    await db
      .update(vendors)
      .set(values)
      .where(and(eq(vendors.id, input.id), eq(vendors.organizationId, organization.id)));
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${input.id}`);
    return { ok: true, id: input.id };
  }

  const [row] = await db
    .insert(vendors)
    .values({ organizationId: organization.id, ...values })
    .returning();
  revalidatePath("/vendors");
  return { ok: true, id: row.id };
}

export async function deleteVendor(id: string): Promise<VendorState> {
  const { organization } = await requireRole("admin");
  await db
    .delete(vendors)
    .where(and(eq(vendors.id, id), eq(vendors.organizationId, organization.id)));
  revalidatePath("/vendors");
  return { ok: true };
}
