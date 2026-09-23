"use server";

import { z } from "zod";
import { requestPasswordReset } from "@/lib/password-reset";
import { allowAttempt, clientIp, HOUR } from "@/lib/rate-limit";

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
  // Over the limit, silently skip sending — the response must look the same
  // either way, or it becomes a way to test which emails have accounts.
  const allowed = await allowAttempt([
    { key: `reset:email:${parsed.data.email.toLowerCase().trim()}`, limit: 3, windowSeconds: HOUR },
    { key: `reset:ip:${await clientIp()}`, limit: 10, windowSeconds: HOUR },
  ]);
  if (allowed) {
    // Only real accounts reach the mail provider, so an error surfacing here
    // would reveal which emails exist. Log it and answer the same way.
    await requestPasswordReset(parsed.data.email).catch((e) =>
      console.error("[forgot-password] reset email failed", e),
    );
  }
  // Always report success — never reveal whether the email has an account.
  return { sent: true };
}
