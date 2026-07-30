import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAuthContext, hasRole } from "@/lib/auth";

// Dev-only fallback for signedBackupUrl() when Supabase isn't configured —
// in production, downloads go straight to a Supabase signed URL and this
// route is never used. Org always comes from the session, never the query
// string, and the filename is checked against a strict pattern before it
// ever touches the filesystem.
const SAFE_FILENAME = /^[\w-]+\.json$/;

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx || !hasRole(ctx.role, "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!SAFE_FILENAME.test(file)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  const abs = path.join(process.cwd(), ".data", "backups", ctx.organization.id, file);
  try {
    const data = await readFile(abs);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${file}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
