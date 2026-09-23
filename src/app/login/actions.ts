"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";
import { allowAttempt, clientIp, MINUTE } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Please enter your email and password." };
  }
  // Per account and per IP, checked before bcrypt runs — so a blocked attempt
  // costs nothing and can't pile failed-sign-in rows into the audit log.
  const allowed = await allowAttempt([
    { key: `login:email:${email.toLowerCase().trim()}`, limit: 10, windowSeconds: 15 * MINUTE },
    { key: `login:ip:${await clientIp()}`, limit: 30, windowSeconds: 15 * MINUTE },
  ]);
  if (!allowed) {
    return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
  }
  const result = await login(email, password);
  if (!result.ok) return { error: result.error };
  redirect("/dashboard");
}
