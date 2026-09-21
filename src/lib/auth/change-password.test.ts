import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { changePasswordCore } from "@/lib/auth";

describe("changePasswordCore", () => {
  let userId: string;
  const originalPassword = "current-password-1";

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({
        email: `change-password-${Date.now()}@example.com`,
        name: "Password Test User",
        passwordHash: await bcrypt.hash(originalPassword, 10),
      })
      .returning();
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  it("rejects an incorrect current password", async () => {
    const result = await changePasswordCore(userId, "not-the-password", "replacement-password-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/current password is incorrect/i);
  });

  it("rejects reusing the current password", async () => {
    const result = await changePasswordCore(userId, originalPassword, originalPassword);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/choose a new password/i);
  });

  it("updates the hash after current-password verification", async () => {
    const nextPassword = "replacement-password-1";
    const result = await changePasswordCore(userId, originalPassword, nextPassword);
    expect(result.ok).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(await bcrypt.compare(nextPassword, user.passwordHash)).toBe(true);
    expect(await bcrypt.compare(originalPassword, user.passwordHash)).toBe(false);
  });
});
