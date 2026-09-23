"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createAuditAccess } from "@/lib/auth/session";

export type AuditUnlockState = { error?: string; unlocked?: boolean };

/** Require the current owner's password before revealing organization-wide history. */
export async function unlockAuditLog(
  _previous: AuditUnlockState,
  formData: FormData,
): Promise<AuditUnlockState> {
  const { user } = await requireRole("owner");
  const password = String(formData.get("password") ?? "");
  if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "That password is incorrect." };
  }
  await createAuditAccess(user.id, user.passwordHash);
  revalidatePath("/log");
  return { unlocked: true };
}
