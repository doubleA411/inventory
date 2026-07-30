import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { quotations, invoices, organizations } from "@/lib/db/schema";

function newToken(): string {
  return randomBytes(20).toString("base64url");
}

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

export async function generateQuotationShareToken(
  orgId: string,
  id: string,
): Promise<string> {
  const token = newToken();
  await db
    .update(quotations)
    .set({ shareToken: token })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
  return token;
}

export async function revokeQuotationShareToken(orgId: string, id: string): Promise<void> {
  await db
    .update(quotations)
    .set({ shareToken: null })
    .where(and(eq(quotations.id, id), eq(quotations.organizationId, orgId)));
}

/** Public lookup by token — no org check (the token itself is the credential). */
export async function getQuotationByShareToken(token: string) {
  const [row] = await db
    .select({ quotation: quotations, organization: organizations })
    .from(quotations)
    .innerJoin(organizations, eq(quotations.organizationId, organizations.id))
    .where(eq(quotations.shareToken, token))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export async function generateInvoiceShareToken(orgId: string, id: string): Promise<string> {
  const token = newToken();
  await db
    .update(invoices)
    .set({ shareToken: token })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
  return token;
}

export async function revokeInvoiceShareToken(orgId: string, id: string): Promise<void> {
  await db
    .update(invoices)
    .set({ shareToken: null })
    .where(and(eq(invoices.id, id), eq(invoices.organizationId, orgId)));
}

export async function getInvoiceByShareToken(token: string) {
  const [row] = await db
    .select({ invoice: invoices, organization: organizations })
    .from(invoices)
    .innerJoin(organizations, eq(invoices.organizationId, organizations.id))
    .where(eq(invoices.shareToken, token))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/** Best-effort Indian mobile normalisation: strips formatting, adds the 91
 * country code to a bare 10-digit number. Returns null if nothing usable. */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

/** wa.me deep link — no phone opens WhatsApp's own contact picker instead. */
export function waLink(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
