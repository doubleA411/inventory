"use server";

import { z } from "zod";
import { requireAuth, changePasswordCore } from "@/lib/auth";
import { createSession } from "@/lib/auth/session";

export type ChangePasswordState = { ok?: boolean; error?: string };

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
  confirmPassword: z.string(),
});

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const { user } = await requireAuth();
  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the password fields." };
  }
  const d = parsed.data;
  if (d.newPassword !== d.confirmPassword) {
    return { error: "New passwords don’t match." };
  }

  const result = await changePasswordCore(user.id, d.currentPassword, d.newPassword);
  if (!result.ok) return { error: result.error };

  // The password change invalidates every old session. Mint a replacement for
  // this browser so the person changing it can continue without being ejected.
  await createSession({ userId: user.id, email: user.email, passwordHash: result.passwordHash });
  return { ok: true };
}
