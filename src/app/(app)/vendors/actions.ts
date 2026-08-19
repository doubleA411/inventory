"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors, products } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { TAMIL_NADU_CODE } from "@/lib/india-states";
import {
  recordVendorPaymentCore,
  reverseVendorPaymentCore,
  type VendorPaymentInput,
} from "@/lib/purchases";
import { productSchema, createProduct } from "@/lib/products";

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
  openingBalance: z.coerce.number().min(0).optional().nullable(),
  // Only applied when creating a new vendor — links each selected product's
  // preferredVendorId to this vendor right away, so staff don't have to go
  // set it product-by-product afterward.
  productIds: z.array(z.string().uuid()).optional(),
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
    openingBalance: String(d.openingBalance ?? 0),
  };

  if (input.id) {
    // Only overwrite what the caller actually sent. `values` fills every column
    // (defaulting to null / "Chennai"), which is right on create but would make
    // a partial edit form silently wipe fields it doesn't render — gstin,
    // address, pincode, email, notes.
    const patch = Object.fromEntries(
      (Object.keys(values) as (keyof typeof values)[])
        .filter((k) => input[k as keyof VendorInput] !== undefined)
        .map((k) => [k, values[k]]),
    );
    await db
      .update(vendors)
      .set(patch)
      .where(and(eq(vendors.id, input.id), eq(vendors.organizationId, organization.id)));
    revalidatePath("/vendors");
    revalidatePath(`/vendors/${input.id}`);
    return { ok: true, id: input.id };
  }

  const [row] = await db
    .insert(vendors)
    .values({ organizationId: organization.id, ...values })
    .returning();

  if (d.productIds?.length) {
    await db
      .update(products)
      .set({ preferredVendorId: row.id })
      .where(
        and(eq(products.organizationId, organization.id), inArray(products.id, d.productIds)),
      );
    revalidatePath("/products");
  }

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

/**
 * Quick "create a new product" for the vendor form's product picker —
 * name + unit is the minimum the product schema requires, no redirect (the
 * caller stays on the vendor modal and just adds the new product to their
 * selection). preferredVendorId gets set the normal way once the vendor
 * itself is saved with this product in its productIds.
 */
export async function quickCreateProduct(
  name: string,
  stockUnitId: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const parsed = productSchema.safeParse({ name, stockUnitId, reorderLevel: 0 });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const result = await createProduct(organization.id, parsed.data);
  if (!result.ok) return result;
  revalidatePath("/products");
  return { ok: true, id: result.id, name: parsed.data.name };
}

export async function recordVendorPayment(
  raw: VendorPaymentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await recordVendorPaymentCore(organization.id, user.id, raw);
  if (result.ok) {
    revalidatePath(`/vendors/${raw.vendorId}`);
    revalidatePath("/vendors");
    revalidatePath("/purchase-bills");
  }
  return result;
}

/**
 * Undo a mistakenly recorded payment. Reverses the whole recording — one
 * payment often lands as several rows across bills — see
 * reverseVendorPaymentCore.
 */
export async function reverseVendorPayment(
  paymentId: string,
  vendorId: string,
): Promise<{ ok: true; amount: number } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const result = await reverseVendorPaymentCore(organization.id, paymentId);
  if (result.ok) {
    revalidatePath(`/vendors/${vendorId}`);
    revalidatePath("/vendors");
    revalidatePath("/purchase-bills");
    revalidatePath("/dashboard");
  }
  return result;
}
