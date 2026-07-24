import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BUCKET = "org-assets";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
];
export const ALLOWED_LETTERHEAD_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function extFor(file: File): string {
  return EXT_BY_TYPE[file.type] ?? (file.name.split(".").pop() || "bin");
}

/**
 * Persist an uploaded file and return a public URL.
 *
 * Production: uploads to Supabase Storage (public bucket) when the service key
 * is configured — no SDK, just the Storage REST API.
 * Dev fallback: writes to `public/uploads/…` so it works with only a DB.
 */
export async function saveUpload(file: File, folder: string): Promise<string> {
  const key = `${folder}/${randomUUID()}.${extFor(file)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: bytes,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Upload failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${key}`;
  }

  // Dev fallback: local filesystem under /public.
  const abs = path.join(process.cwd(), "public", "uploads", key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return `/uploads/${key}`;
}
