import { describe, it, expect, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { sessionAuthHash, sessionMatchesUser, type ReadSession } from "./session";

/**
 * Sessions are stateless JWTs with a 30-day life and there is no session table
 * to clear, so the only thing standing between "I reset my password" and "the
 * attacker's cookie still works for a month" is the auth-hash claim. These
 * tests pin that behaviour down.
 */
describe("session auth hash", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET ??= "test-secret-for-session-auth-hash";
  });

  const session = (authHash: string): ReadSession => ({
    userId: "11111111-1111-1111-1111-111111111111",
    email: "user@example.com",
    authHash,
  });

  it("matches a session against the password hash it was issued under", async () => {
    const hash = await bcrypt.hash("correct horse battery", 10);
    expect(sessionMatchesUser(session(sessionAuthHash(hash)), hash)).toBe(true);
  });

  it("stops matching once the password changes", async () => {
    const before = await bcrypt.hash("old-password-1", 10);
    const issued = session(sessionAuthHash(before));

    const after = await bcrypt.hash("new-password-1", 10);
    expect(sessionMatchesUser(issued, after)).toBe(false);
  });

  it("stops matching even when the same password is set again", async () => {
    // bcrypt salts every hash, so re-setting an identical password still
    // produces a new hash — and still evicts old sessions.
    const before = await bcrypt.hash("same-password-1", 10);
    const issued = session(sessionAuthHash(before));

    const after = await bcrypt.hash("same-password-1", 10);
    expect(after).not.toBe(before);
    expect(sessionMatchesUser(issued, after)).toBe(false);
  });

  it("rejects an empty or malformed claim", async () => {
    const hash = await bcrypt.hash("correct horse battery", 10);
    expect(sessionMatchesUser(session(""), hash)).toBe(false);
    expect(sessionMatchesUser(session("not-a-real-digest"), hash)).toBe(false);
  });

  it("never puts the password hash itself in the token", async () => {
    const hash = await bcrypt.hash("correct horse battery", 10);
    const claim = sessionAuthHash(hash);
    expect(claim).not.toContain(hash);
    expect(claim.length).toBeLessThan(hash.length + 32);
  });
});
