"use server";

import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";

export type ForgotPasswordState = { sent?: boolean; error?: string };

const schema = z.object({ email: z.string().email("Enter a valid email") });

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await requestPasswordReset(parsed.data.email);
  // Always report success — never reveal whether the email has an account.
  return { sent: true };
}
