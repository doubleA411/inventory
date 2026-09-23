"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { stateNameByCode, TAMIL_NADU_CODE } from "@/lib/india-states";
import { findCustomerByPhone } from "@/lib/billing-queries";

export type CustomerState = {
  error?: string;
  ok?: boolean;
  id?: string;
  /** Another customer already has this phone number; caller can offer to reuse it or save anyway. */
  duplicate?: { id: string; name: string };
};

const schema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  gstin: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  district: z.string().trim().optional(),
  location: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(1, "Phone number is required"),
  email: z.string().trim().optional().nullable(),
  /** Set once the caller has seen the duplicate warning and wants to save anyway. */
  confirmDuplicate: z.boolean().optional(),
});

export type CustomerInput = z.infer<typeof schema>;

export async function saveCustomer(
  input: CustomerInput & { id?: string },
): Promise<CustomerState> {
  const { organization, user } = await requireRole("admin");
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
  };

  if (values.phone && !d.confirmDuplicate) {
    const existing = await findCustomerByPhone(organization.id, values.phone, input.id);
    if (existing) {
      return { duplicate: { id: existing.id, name: existing.name } };
    }
  }

  if (input.id) {
    await db
      .update(customers)
      .set(values)
      .where(
        and(eq(customers.id, input.id), eq(customers.organizationId, organization.id)),
      );
    await recordAudit({
      orgId: organization.id,
      action: "customer.updated",
      entityType: "customer",
      entityId: input.id,
      summary: `Updated customer ${values.name}`,
      actorUserId: user.id,
    });
    revalidatePath("/customers");
    return { ok: true, id: input.id };
  }

  const [row] = await db
    .insert(customers)
    .values({ organizationId: organization.id, ...values })
    .returning();
  await recordAudit({
    orgId: organization.id,
    action: "customer.created",
    entityType: "customer",
    entityId: row.id,
    summary: `Created customer ${values.name}`,
    details: { phone: values.phone },
    actorUserId: user.id,
  });
  revalidatePath("/customers");
  return { ok: true, id: row.id };
}

export async function deleteCustomer(id: string): Promise<CustomerState> {
  const { organization, user } = await requireRole("admin");
  await db
    .update(customers)
    .set({ deletedAt: new Date(), deletedBy: user.id })
    .where(and(eq(customers.id, id), eq(customers.organizationId, organization.id)));
  await recordAudit({
    orgId: organization.id,
    action: "customer.archived",
    entityType: "customer",
    entityId: id,
    summary: "Archived customer",
    actorUserId: user.id,
  });
  revalidatePath("/customers");
  return { ok: true };
}

// re-export for display convenience
export { stateNameByCode };
