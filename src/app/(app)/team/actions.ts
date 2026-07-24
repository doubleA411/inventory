"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships } from "@/lib/db/schema";
import { requireRole, createTeamMember, getAuthContext } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["admin", "staff"]),
});

export async function inviteMemberAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = inviteSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const res = await createTeamMember({
    organizationId: organization.id,
    ...parsed.data,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/team");
  return { ok: true };
}

export async function removeMemberAction(
  membershipId: string,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const ctx = await getAuthContext();
  // Don't let someone remove their own membership.
  if (ctx && ctx.membership.id === membershipId) {
    return { error: "You can't remove yourself." };
  }
  await db
    .delete(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, organization.id),
      ),
    );
  revalidatePath("/team");
  return { ok: true };
}
