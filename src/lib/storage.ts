import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const BUCKET = "org-assets";
const BACKUP_BUCKET = "org-backups";
const DOCUMENT_BUCKET = "org-documents";

function supabaseCreds() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? { url, serviceKey } : null;
}

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

// ---------------------------------------------------------------------------
// Private backups: never in the public bucket, never web-served directly —
// downloads only ever go out as short-lived signed URLs (or, in the dev
// fallback with no Supabase configured, through an auth-gated app route).
// ---------------------------------------------------------------------------

let backupBucketReady: Promise<void> | null = null;

/** Idempotent — creates the private bucket once, ignoring "already exists". */
function ensureBackupBucket(creds: { url: string; serviceKey: string }): Promise<void> {
  if (!backupBucketReady) {
    backupBucketReady = fetch(`${creds.url}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: BACKUP_BUCKET, name: BACKUP_BUCKET, public: false }),
    }).then(() => undefined);
  }
  return backupBucketReady;
}

function localBackupDir(orgId: string): string {
  return path.join(process.cwd(), ".data", "backups", orgId);
}

/** Upload one org's backup JSON. Returns the filename (not a full path/URL). */
export async function saveBackup(
  orgId: string,
  filename: string,
  json: string,
): Promise<string> {
  const creds = supabaseCreds();
  if (creds) {
    await ensureBackupBucket(creds);
    const key = `${orgId}/${filename}`;
    const res = await fetch(`${creds.url}/storage/v1/object/${BACKUP_BUCKET}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/json",
        "x-upsert": "true",
      },
      body: json,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Backup upload failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    return filename;
  }

  const abs = path.join(localBackupDir(orgId), filename);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, json);
  return filename;
}

export type BackupFile = { name: string; createdAt: string; sizeBytes: number };

export async function listBackups(orgId: string): Promise<BackupFile[]> {
  const creds = supabaseCreds();
  if (creds) {
    const res = await fetch(`${creds.url}/storage/v1/object/list/${BACKUP_BUCKET}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix: orgId,
        limit: 200,
        sortBy: { column: "name", order: "desc" },
      }),
    });
    if (!res.ok) return [];
    const items: {
      name?: string;
      id?: string;
      created_at?: string;
      metadata?: { size?: number };
    }[] = await res.json();
    return items
      .filter((i) => i.id) // skip the placeholder "folder" entry, if any
      .map((i) => ({
        name: i.name ?? "",
        createdAt: i.created_at ?? "",
        sizeBytes: i.metadata?.size ?? 0,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  try {
    const dir = localBackupDir(orgId);
    const files = await readdir(dir);
    const stats = await Promise.all(
      files.map(async (name) => {
        const s = await stat(path.join(dir, name));
        return { name, createdAt: s.birthtime.toISOString(), sizeBytes: s.size };
      }),
    );
    return stats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/** Short-lived download link for one backup file. */
export async function signedBackupUrl(orgId: string, filename: string): Promise<string> {
  const creds = supabaseCreds();
  if (creds) {
    const key = `${orgId}/${filename}`;
    const res = await fetch(
      `${creds.url}/storage/v1/object/sign/${BACKUP_BUCKET}/${key}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.serviceKey}`,
          apikey: creds.serviceKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 300 }),
      },
    );
    if (!res.ok) throw new Error("Could not create a download link.");
    const { signedURL } = await res.json();
    return `${creds.url}/storage/v1${signedURL}`;
  }

  // Dev fallback: an auth-gated app route reads the local file directly —
  // there's no real "signed URL" concept without Supabase configured.
  return `/api/backups/download?file=${encodeURIComponent(filename)}`;
}

/** Delete specific backup files for an org (used by the retention prune). */
export async function deleteBackups(orgId: string, filenames: string[]): Promise<void> {
  if (filenames.length === 0) return;
  const creds = supabaseCreds();
  if (creds) {
    await fetch(`${creds.url}/storage/v1/object/${BACKUP_BUCKET}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: filenames.map((f) => `${orgId}/${f}`) }),
    });
    return;
  }

  const dir = localBackupDir(orgId);
  await Promise.all(filenames.map((f) => unlink(path.join(dir, f)).catch(() => {})));
}

// ---------------------------------------------------------------------------
// Generated documents (invoice/quotation PDFs): private bucket, one file per
// document number so a given invoice/quotation always overwrites the same
// key instead of accumulating regenerated copies — easy to find by number
// without a separate index.
// ---------------------------------------------------------------------------

let documentBucketReady: Promise<void> | null = null;

function ensureDocumentBucket(creds: { url: string; serviceKey: string }): Promise<void> {
  if (!documentBucketReady) {
    documentBucketReady = fetch(`${creds.url}/storage/v1/bucket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: DOCUMENT_BUCKET, name: DOCUMENT_BUCKET, public: false }),
    }).then(() => undefined);
  }
  return documentBucketReady;
}

/**
 * Saves a generated invoice/quotation PDF at a deterministic key —
 * `{orgId}/invoices/{number}.pdf` or `{orgId}/quotations/{number}.pdf` —
 * so re-downloading the same document overwrites its one file rather than
 * piling up copies.
 */
export async function saveDocument(key: string, pdf: Buffer): Promise<void> {
  const creds = supabaseCreds();
  if (creds) {
    await ensureDocumentBucket(creds);
    const res = await fetch(`${creds.url}/storage/v1/object/${DOCUMENT_BUCKET}/${key}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.serviceKey}`,
        apikey: creds.serviceKey,
        "Content-Type": "application/pdf",
        "x-upsert": "true",
      },
      body: new Uint8Array(pdf),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Document upload failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    return;
  }

  const abs = path.join(process.cwd(), ".data", "documents", key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, pdf);
}
