import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { saveUpload } from "@/lib/storage";

// Local-disk fallback: used when Supabase Storage env vars are absent
// (e.g. a contributor's machine with no Supabase project configured).
describe("saveUpload (local fallback, no Supabase env)", () => {
  const written: string[] = [];
  let savedUrl: string | undefined;
  let savedKey: string | undefined;

  beforeAll(() => {
    savedUrl = process.env.SUPABASE_URL;
    savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterAll(async () => {
    if (savedUrl !== undefined) process.env.SUPABASE_URL = savedUrl;
    if (savedKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey;
    for (const url of written) {
      const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
      await rm(abs, { force: true });
    }
  });

  it("writes a file under /uploads and returns its public path", async () => {
    const file = new File([Buffer.from("hello-logo")], "logo.png", {
      type: "image/png",
    });
    const url = await saveUpload(file, "test-org/logos");
    written.push(url);

    expect(url).toMatch(/^\/uploads\/test-org\/logos\/.+\.png$/);

    const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
    const contents = await readFile(abs, "utf8");
    expect(contents).toBe("hello-logo");
  });

  it("keeps the correct extension for a PDF letterhead", async () => {
    const file = new File([Buffer.from("%PDF-1.4")], "lh.pdf", {
      type: "application/pdf",
    });
    const url = await saveUpload(file, "test-org/letterheads");
    written.push(url);
    expect(url).toMatch(/\.pdf$/);
  });
});

// Supabase Storage path: used in production, and locally when the service
// role key is configured (as it is in this repo's .env.local for dev parity).
describe("saveUpload (Supabase Storage)", () => {
  const uploaded: string[] = [];

  afterAll(async () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    for (const key_ of uploaded) {
      await fetch(`${url}/storage/v1/object/org-assets/${key_}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, apikey: key },
      }).catch(() => {});
    }
  });

  it.runIf(!!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY)(
    "uploads to Supabase Storage and returns a public URL",
    async () => {
      const file = new File([Buffer.from("hello-supabase")], "logo.png", {
        type: "image/png",
      });
      const folder = `test-org-${Date.now()}/logos`;
      const url = await saveUpload(file, folder);

      expect(url).toMatch(
        new RegExp(`^${process.env.SUPABASE_URL}/storage/v1/object/public/org-assets/${folder}/.+\\.png$`),
      );
      uploaded.push(url.split("/org-assets/")[1]);

      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("hello-supabase");
    },
  );
});
