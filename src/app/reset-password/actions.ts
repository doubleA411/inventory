"use server";

import { z } from "zod";
import { resetPassword, type ResetResult } from "@/lib/password-reset";

export type ResetPasswordState = { ok?: boolean; error?: string };

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
});

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  if (d.password !== d.confirmPassword) {
    return { error: "Passwords don't match." };
  }
  const result: ResetResult = await resetPassword(d.token, d.password);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}
