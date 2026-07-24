import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, passwordResetTokens } from "@/lib/db/schema";
import { requestPasswordReset, resetPassword } from "@/lib/password-reset";

const run = Date.now();

/** Capture the raw reset token from the dev-mode console fallback in email.ts. */
async function requestAndCaptureToken(email: string): Promise<string | null> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  await requestPasswordReset(email);
  const printed = spy.mock.calls.map((c) => c.join(" ")).join("\n");
  spy.mockRestore();
  const match = printed.match(/token=([a-f0-9]+)/);
  return match ? match[1] : null;
}

describe("password reset", () => {
  let email: string;
  const cleanupUserIds: string[] = [];
  let savedResendKey: string | undefined;

  beforeAll(async () => {
    // These tests exercise the reset-token logic, not real email delivery
    // (that's covered separately) — force the console-log dev fallback in
    // email.ts so they're deterministic and don't depend on Resend being
    // configured, reachable, or willing to accept a fake @example.com address.
    savedResendKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;

    email = `reset-test-${run}@example.com`;
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: "original-hash", name: "Reset Test User" })
      .returning();
    cleanupUserIds.push(user.id);
  });

  afterAll(async () => {
    if (savedResendKey !== undefined) process.env.RESEND_API_KEY = savedResendKey;
    if (cleanupUserIds.length) {
      await db.delete(users).where(inArray(users.id, cleanupUserIds));
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a token and never leaks whether the account exists", async () => {
    const token = await requestAndCaptureToken(email);
    expect(token).toBeTruthy();
    expect(token).toHaveLength(64); // 32 bytes hex

    // No email at all -> should not throw, and reports the same (no data).
    await expect(
      requestPasswordReset(`nobody-${run}@example.com`),
    ).resolves.toBeUndefined();
  });

  it("stores only a hash of the token, never the raw value", async () => {
    const token = await requestAndCaptureToken(email);
    expect(token).toBeTruthy();
    const [user] = await db.select().from(users).where(eq(users.email, email));
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.tokenHash).not.toBe(token);
    }
  });

  it("resets the password with a valid token and single-uses it", async () => {
    const token = await requestAndCaptureToken(email);
    expect(token).toBeTruthy();
    if (!token) return;

    const res = await resetPassword(token, "newpassword123");
    expect(res.ok).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user.passwordHash).not.toBe("original-hash");

    // Using the same token again must fail (single-use).
    const reuse = await resetPassword(token, "anotherpassword");
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.error).toMatch(/already been used/i);
  });

  it("invalidates the previous token when a new reset is requested", async () => {
    const first = await requestAndCaptureToken(email);
    const second = await requestAndCaptureToken(email);
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(first).not.toBe(second);

    if (!first || !second) return;
    const firstResult = await resetPassword(first, "somepassword1");
    expect(firstResult.ok).toBe(false); // superseded by the second request

    const secondResult = await resetPassword(second, "somepassword2");
    expect(secondResult.ok).toBe(true);
  });

  it("rejects an unknown token", async () => {
    const res = await resetPassword("0".repeat(64), "somepassword");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/invalid/i);
  });

  it("rejects a password shorter than 6 characters", async () => {
    const token = await requestAndCaptureToken(email);
    expect(token).toBeTruthy();
    if (!token) return;
    const res = await resetPassword(token, "abc");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/at least 6/i);
  });

  it("rejects an expired token", async () => {
    const token = await requestAndCaptureToken(email);
    expect(token).toBeTruthy();
    if (!token) return;

    // Force-expire the token that was just created.
    const [user] = await db.select().from(users).where(eq(users.email, email));
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, user.id));

    const res = await resetPassword(token, "somepassword1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/expired/i);
  });
});
