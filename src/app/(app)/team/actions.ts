"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships } from "@/lib/db/schema";
import { requireRole, createTeamMember, getAuthContext, hasRole } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Name required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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
  const { organization, role } = await requireRole("admin");
  const ctx = await getAuthContext();
  // Don't let someone remove their own membership.
  if (ctx && ctx.membership.id === membershipId) {
    return { error: "You can't remove yourself." };
  }

  const [target] = await db
    .select({ id: memberships.id, role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, organization.id),
      ),
    )
    .limit(1);
  if (!target) return { error: "That team member no longer exists." };

  // Rank check. Removing a membership doesn't demote someone, it detaches them
  // from the org entirely — getAuthContext resolves the org *through* this row,
  // so deleting it locks them out of every page with no way back in, since
  // /team is the only place memberships are created. An admin removing the
  // owner would therefore take sole control of the business's data.
  // Strictly-higher only: peers removing peers (admin/admin, owner/owner) is
  // ordinary team management, and the last-owner guard below covers the one
  // way that could go wrong.
  if (hasRole(target.role, role) && target.role !== role) {
    return { error: "You can't remove someone with a higher role than yours." };
  }

  // Never strip the org of its last owner, however that comes about.
  if (target.role === "owner") {
    const owners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organization.id),
          eq(memberships.role, "owner"),
        ),
      );
    if (owners.length <= 1) {
      return { error: "An organization must always have at least one owner." };
    }
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
