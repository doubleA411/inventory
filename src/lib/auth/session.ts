import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "inv_session";
const AUDIT_COOKIE_NAME = "inv_audit_access";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const AUDIT_MAX_AGE = 60 * 15; // Password re-entry grants a short, separate audit session.

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

/**
 * Session auth hash — the thing that makes a password change log everyone out.
 *
 * Sessions are stateless JWTs with a 30-day life and there is no session table
 * to delete rows from, so a reset password would otherwise leave every cookie
 * issued before it working for the rest of that month: exactly the cookie the
 * victim is resetting their password to get rid of. Binding the token to a
 * keyed digest of the current password hash fixes that without a schema
 * change — `getAuthContext` already loads the user row, so it can recompute
 * this and reject any token that doesn't match. Change the password and every
 * previously issued token stops verifying on the next request.
 *
 * It's the password *hash* that's digested, never the password, and the digest
 * is keyed with AUTH_SECRET so the claim can't be derived from a stolen DB
 * dump alone. bcrypt hashes are salted, so a re-used password still produces a
 * new hash and still invalidates.
 */
export function sessionAuthHash(passwordHash: string): string {
  return createHmac("sha256", getSecret()).update(passwordHash).digest("base64url");
}

function hashesMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export type SessionPayload = {
  userId: string;
  email: string;
};

export async function createSession(
  payload: SessionPayload & { passwordHash: string },
): Promise<void> {
  const token = await new SignJWT({
    userId: payload.userId,
    email: payload.email,
    pwh: sessionAuthHash(payload.passwordHash),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export type ReadSession = SessionPayload & { authHash: string };

export async function readSession(): Promise<ReadSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const authHash = typeof payload.pwh === "string" ? payload.pwh : "";
    // Tokens minted before the auth hash existed carry no `pwh` and are not
    // trusted — they predate password-change invalidation, so honouring them
    // would keep the hole open for the rest of their 30-day life. Everyone
    // signs in once after this ships.
    if (!authHash) return null;
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      authHash,
    };
  } catch {
    return null;
  }
}

/** True when the session's bound password hash is still the user's current one. */
export function sessionMatchesUser(session: ReadSession, passwordHash: string): boolean {
  return hashesMatch(session.authHash, sessionAuthHash(passwordHash));
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
  store.delete({ name: AUDIT_COOKIE_NAME, path: "/log" });
}

/** Grant the current owner a short-lived, password-confirmed audit-log session. */
export async function createAuditAccess(userId: string, passwordHash: string): Promise<void> {
  const token = await new SignJWT({ userId, pwh: sessionAuthHash(passwordHash), scope: "audit" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${AUDIT_MAX_AGE}s`)
    .sign(getSecret());
  const store = await cookies();
  store.set(AUDIT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/log",
    maxAge: AUDIT_MAX_AGE,
  });
}

/** Check that this browser recently re-entered this user's current password. */
export async function hasAuditAccess(userId: string, passwordHash: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(AUDIT_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    return (
      payload.scope === "audit" &&
      payload.userId === userId &&
      typeof payload.pwh === "string" &&
      hashesMatch(payload.pwh, sessionAuthHash(passwordHash))
    );
  } catch {
    return false;
  }
}
