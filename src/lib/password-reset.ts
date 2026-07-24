import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { sendEmail, getBaseUrl } from "@/lib/email";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Request a password reset email. Always resolves the same way whether or
 * not the email belongs to an account — callers must not use this to probe
 * for account existence.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const clean = email.toLowerCase().trim();
  const [user] = await db.select().from(users).where(eq(users.email, clean)).limit(1);
  if (!user) return;

  // Invalidate any earlier unused tokens so only the newest link works.
  await db
    .delete(passwordResetTokens)
    .where(
      and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)),
    );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

  const link = `${getBaseUrl()}/reset-password?token=${rawToken}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Stackwise password",
    html: `
      <p>Hi ${user.name},</p>
      <p>Click the link below to reset your Stackwise password. This link expires in
      1 hour and can only be used once.</p>
      <p><a href="${link}">${link}</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export type ResetResult = { ok: true } | { ok: false; error: string };

/** Consume a reset token and set the account's new password. */
export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<ResetResult> {
  if (!rawToken) return { ok: false, error: "This reset link is invalid." };
  if (newPassword.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const tokenHash = hashToken(rawToken);
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row) return { ok: false, error: "This reset link is invalid." };
  if (row.usedAt) return { ok: false, error: "This reset link has already been used." };
  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This reset link has expired. Request a new one." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
  });

  return { ok: true };
}
