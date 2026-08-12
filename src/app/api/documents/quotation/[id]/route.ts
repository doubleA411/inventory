import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, hasRole } from "@/lib/auth";
import { getQuotationFull } from "@/lib/billing-queries";
import { renderPagePdf, docFilename } from "@/lib/pdf";
import { saveDocument } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx || !hasRole(ctx.role, "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const data = await getQuotationFull(ctx.organization.id, id);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!data.quotation.approvedAt) {
    return NextResponse.json({ error: "Needs owner approval first" }, { status: 409 });
  }

  const filename = docFilename(data.quotation.number);
  const pdf = await renderPagePdf(
    `/print/quotation/${id}`,
    req.nextUrl.origin,
    req.headers.get("cookie") ?? "",
  );
  await saveDocument(`${ctx.organization.id}/quotations/${filename}`, pdf).catch((err) => {
    console.error("Failed to archive quotation PDF:", err);
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
