import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, memberships, organizations } from "@/lib/db/schema";
import type { Role, User, Organization, Membership } from "@/lib/db/schema";
import { createSession, destroySession, readSession } from "./session";

export type AuthContext = {
  user: User;
  organization: Organization;
  membership: Membership;
  role: Role;
};

/**
 * Resolve the full auth context for the current request.
 * v1 is single-org, so we take the user's (only) membership.
 * Cached per-request via React `cache`.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession();
  if (!session) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user) return null;

  const [row] = await db
    .select({ membership: memberships, organization: organizations })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, user.id))
    .limit(1);
  if (!row) return null;

  return {
    user,
    organization: row.organization,
    membership: row.membership,
    role: row.membership.role,
  };
});

/** Require a signed-in user; redirect to /login otherwise. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

const ROLE_RANK: Record<Role, number> = { staff: 1, admin: 2, owner: 3 };

export function hasRole(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Require at least the given role; redirect to dashboard otherwise. */
export async function requireRole(min: Role): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!hasRole(ctx.role, min)) redirect("/dashboard?error=forbidden");
  return ctx;
}

// --- credential helpers -----------------------------------------------------

export async function login(
  email: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  if (!user) return { ok: false, error: "Invalid email or password." };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { ok: false, error: "Invalid email or password." };

  await createSession({ userId: user.id, email: user.email });
  return { ok: true };
}

export async function logout(): Promise<void> {
  await destroySession();
}

/**
 * Create a new user and attach them to the given org with a role.
 * Used by the "invite team member" flow (owner/admin only).
 */
export async function createTeamMember(params: {
  organizationId: string;
  email: string;
  password: string;
  name: string;
  role: Role;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = params.email.toLowerCase().trim();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return { ok: false, error: "A user with that email already exists." };
  }
  const passwordHash = await bcrypt.hash(params.password, 10);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name: params.name.trim() })
    .returning();
  await db.insert(memberships).values({
    userId: user.id,
    organizationId: params.organizationId,
    role: params.role,
  });
  return { ok: true };
}
