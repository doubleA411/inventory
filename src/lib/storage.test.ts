import { describe, it, expect, afterAll } from "vitest";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { saveUpload } from "@/lib/storage";

// With no SUPABASE_SERVICE_ROLE_KEY set, saveUpload falls back to local FS.
describe("saveUpload (local fallback)", () => {
  const written: string[] = [];

  afterAll(async () => {
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
