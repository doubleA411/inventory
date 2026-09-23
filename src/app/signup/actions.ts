"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, organizations, memberships } from "@/lib/db/schema";
import { seedOrgDefaults } from "@/lib/db/seed-org";
import { createSession } from "@/lib/auth/session";
import { allowAttempt, clientIp, HOUR } from "@/lib/rate-limit";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required"),
  companyName: z.string().trim().min(1, "Company name is required"),
  industry: z.string().trim().min(1, "Choose an industry"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignupState = { error?: string };

export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName"),
    industry: formData.get("industry"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;
  const email = d.email.toLowerCase().trim();
  // .local is the seed/demo domain — never a real mailbox, and letting someone
  // register owner@catering.local in production would hand them the "demo".
  if (/\.(local|localhost|test|invalid|example)$/.test(email.split("@")[1] ?? "")) {
    return { error: "Enter a real email address." };
  }

  if (!(await allowAttempt([{ key: `signup:ip:${await clientIp()}`, limit: 5, windowSeconds: HOUR }]))) {
    return { error: "Too many sign-ups from this network. Try again in an hour." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  // Create org + owner user + membership, then seed industry defaults — all
  // or nothing, so a failure halfway (say, two sign-ups racing for the same
  // email) can't leave an orphan organization behind.
  const passwordHash = await bcrypt.hash(d.password, 10);
  let user: { id: string; email: string; passwordHash: string };
  try {
    user = await db.transaction(async (tx) => {
      const [org] = await tx
        .insert(organizations)
        .values({
          name: d.companyName,
          industry: d.industry,
          currency: "INR",
          timezone: "Asia/Kolkata",
        })
        .returning();
      const [u] = await tx
        .insert(users)
        .values({ email, passwordHash, name: d.name })
        .returning();
      await tx.insert(memberships).values({
        userId: u.id,
        organizationId: org.id,
        role: "owner",
      });
      await seedOrgDefaults(tx, org.id, d.industry);
      return u;
    });
  } catch {
    return { error: "Could not create the workspace. If you already have an account, sign in." };
  }

  await createSession({
    userId: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
  });
  redirect("/dashboard");
}
