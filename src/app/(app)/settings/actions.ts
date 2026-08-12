"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { stateNameByCode } from "@/lib/india-states";
import {
  saveUpload,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_LETTERHEAD_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

export type ActionState = { error?: string; ok?: boolean };

function str(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  legalName: z.string().trim().optional().nullable(),
  addressLine: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  stateCode: z.string().trim().optional().nullable(),
  pincode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  gstRegistered: z.boolean(),
  gstin: z.string().trim().optional().nullable(),
  defaultTaxRate: z.coerce.number().min(0).max(100).default(0),
  defaultSac: z.string().trim().optional().nullable(),
  bankName: z.string().trim().optional().nullable(),
  bankAccountName: z.string().trim().optional().nullable(),
  bankAccount: z.string().trim().optional().nullable(),
  bankIfsc: z.string().trim().optional().nullable(),
  bankUpi: z.string().trim().optional().nullable(),
  invoicePrefix: z.string().trim().min(1).default("INV"),
  quotePrefix: z.string().trim().min(1).default("QUO"),
  invoiceStartingNumber: z.coerce.number().int().min(0).default(0),
  defaultTerms: z.string().trim().optional().nullable(),
  defaultNotes: z.string().trim().optional().nullable(),
});

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const parsed = settingsSchema.safeParse({
    name: formData.get("name"),
    legalName: str(formData.get("legalName")),
    addressLine: str(formData.get("addressLine")),
    city: str(formData.get("city")),
    stateCode: str(formData.get("stateCode")),
    pincode: str(formData.get("pincode")),
    phone: str(formData.get("phone")),
    email: str(formData.get("email")),
    website: str(formData.get("website")),
    gstRegistered: formData.get("gstRegistered") === "on",
    gstin: str(formData.get("gstin")),
    defaultTaxRate: formData.get("defaultTaxRate") || 0,
    defaultSac: str(formData.get("defaultSac")),
    bankName: str(formData.get("bankName")),
    bankAccountName: str(formData.get("bankAccountName")),
    bankAccount: str(formData.get("bankAccount")),
    bankIfsc: str(formData.get("bankIfsc")),
    bankUpi: str(formData.get("bankUpi")),
    invoicePrefix: formData.get("invoicePrefix") || "INV",
    quotePrefix: formData.get("quotePrefix") || "QUO",
    invoiceStartingNumber: formData.get("invoiceStartingNumber") || 0,
    defaultTerms: str(formData.get("defaultTerms")),
    defaultNotes: str(formData.get("defaultNotes")),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  if (d.gstRegistered && !d.gstin) {
    return { error: "GSTIN is required when the business is GST-registered." };
  }

  await db
    .update(organizations)
    .set({
      name: d.name,
      legalName: d.legalName ?? null,
      addressLine: d.addressLine ?? null,
      city: d.city ?? null,
      stateCode: d.stateCode ?? null,
      state: stateNameByCode(d.stateCode),
      pincode: d.pincode ?? null,
      phone: d.phone ?? null,
      email: d.email ?? null,
      website: d.website ?? null,
      gstRegistered: d.gstRegistered,
      gstin: d.gstin ?? null,
      defaultTaxRate: String(d.defaultTaxRate),
      defaultSac: d.defaultSac ?? null,
      bankName: d.bankName ?? null,
      bankAccountName: d.bankAccountName ?? null,
      bankAccount: d.bankAccount ?? null,
      bankIfsc: d.bankIfsc ?? null,
      bankUpi: d.bankUpi ?? null,
      invoicePrefix: d.invoicePrefix,
      quotePrefix: d.quotePrefix,
      invoiceStartingNumber: d.invoiceStartingNumber,
      defaultTerms: d.defaultTerms ?? null,
      defaultNotes: d.defaultNotes ?? null,
    })
    .where(eq(organizations.id, organization.id));

  revalidatePath("/settings");
  return { ok: true };
}

export async function saveLetterheadMargins(
  top: number,
  bottom: number,
  customerTop: number,
  docTitleTop: number,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const clamp = (n: number) => Math.max(0, Math.min(700, Math.round(n)));
  await db
    .update(organizations)
    .set({
      letterheadMarginTop: String(clamp(top)),
      letterheadMarginBottom: String(clamp(bottom)),
      customerBlockTop: String(clamp(customerTop)),
      docTitleTop: String(clamp(docTitleTop)),
    })
    .where(eq(organizations.id, organization.id));
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveDocAppearance(
  headingColor: string,
  bodyColor: string,
  fontSize: number,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!hex.test(headingColor) || !hex.test(bodyColor)) {
    return { error: "Colors must be valid hex values." };
  }
  await db
    .update(organizations)
    .set({
      docHeadingColor: headingColor,
      docBodyColor: bodyColor,
      docFontSize: Math.max(10, Math.min(22, Math.round(fontSize))),
    })
    .where(eq(organizations.id, organization.id));
  revalidatePath("/settings");
  return { ok: true };
}

const ASSET_FIELDS = {
  logoUrl: { types: ALLOWED_IMAGE_TYPES, folder: "logos" },
  letterheadUrl: { types: ALLOWED_LETTERHEAD_TYPES, folder: "letterheads" },
  signatureUrl: { types: ALLOWED_IMAGE_TYPES, folder: "signatures" },
} as const;

type AssetField = keyof typeof ASSET_FIELDS;

export async function uploadAssetAction(
  field: AssetField,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { organization } = await requireRole("admin");
  const cfg = ASSET_FIELDS[field];
  if (!cfg) return { error: "Unknown asset." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (!cfg.types.includes(file.type)) {
    return { error: `Unsupported file type (${file.type || "unknown"}).` };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "File is too large (max 5 MB)." };
  }

  let url: string;
  try {
    url = await saveUpload(file, `${organization.id}/${cfg.folder}`);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }

  await db
    .update(organizations)
    .set({ [field]: url })
    .where(eq(organizations.id, organization.id));

  revalidatePath("/settings");
  return { ok: true };
}
