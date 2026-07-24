"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, organizations, memberships } from "@/lib/db/schema";
import { seedOrgDefaults } from "@/lib/db/seed-org";
import { createSession } from "@/lib/auth/session";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required"),
  companyName: z.string().trim().min(1, "Company name is required"),
  industry: z.string().trim().min(1, "Choose an industry"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
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

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { error: "An account with that email already exists. Try signing in." };
  }

  // Create org + owner user + membership, then seed industry defaults.
  const [org] = await db
    .insert(organizations)
    .values({
      name: d.companyName,
      industry: d.industry,
      currency: "INR",
      timezone: "Asia/Kolkata",
    })
    .returning();

  const passwordHash = await bcrypt.hash(d.password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name: d.name })
    .returning();

  await db.insert(memberships).values({
    userId: user.id,
    organizationId: org.id,
    role: "owner",
  });

  await seedOrgDefaults(db, org.id, d.industry);

  await createSession({ userId: user.id, email: user.email });
  redirect("/dashboard");
}
