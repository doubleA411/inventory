"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { stateNameByCode } from "@/lib/india-states";

export type CustomerState = { error?: string; ok?: boolean; id?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Customer name is required"),
  gstin: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  stateCode: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
});

export type CustomerInput = z.infer<typeof schema>;

export async function saveCustomer(
  input: CustomerInput & { id?: string },
): Promise<CustomerState> {
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
    city: d.city || null,
    stateCode: d.stateCode || null,
    pincode: d.pincode || null,
    phone: d.phone || null,
    email: d.email || null,
  };

  if (input.id) {
    await db
      .update(customers)
      .set(values)
      .where(
        and(eq(customers.id, input.id), eq(customers.organizationId, organization.id)),
      );
    revalidatePath("/customers");
    return { ok: true, id: input.id };
  }

  const [row] = await db
    .insert(customers)
    .values({ organizationId: organization.id, ...values })
    .returning();
  revalidatePath("/customers");
  return { ok: true, id: row.id };
}

export async function deleteCustomer(id: string): Promise<CustomerState> {
  const { organization } = await requireRole("admin");
  await db
    .delete(customers)
    .where(and(eq(customers.id, id), eq(customers.organizationId, organization.id)));
  revalidatePath("/customers");
  return { ok: true };
}

// re-export for display convenience
export { stateNameByCode };
