import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthContext } from "@/lib/auth";
import { listProducts, listAllMovements } from "@/lib/queries";
import { fmtDate } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "products";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const orgId = ctx.organization.id;

  let rows: Record<string, unknown>[] = [];
  let filename = "export";

  if (type === "movements") {
    const p = req.nextUrl.searchParams;
    const movements = await listAllMovements(orgId, {
      limit: 10000,
      type: p.get("mtype") ?? undefined,
      categoryId: p.get("category") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
    });
    rows = movements.map((m) => ({
      Date: fmtDate(m.createdAt),
      Product: m.productName,
      Type: MOVEMENT_META[m.type].label,
      Quantity: Number(m.quantity),
      Unit: m.unitSymbol,
      "Balance after": Number(m.balanceAfter),
      Cost: Number(m.costAmount),
      Bill: m.invoiceNumber ?? "",
      Note: m.note ?? "",
      By: m.userName ?? "",
    }));
    filename = "stock-history";
  } else {
    const products = await listProducts(orgId);
    rows = products.map((p) => ({
      Name: p.name,
      Code: p.code ?? "",
      Category: p.categoryName ?? "",
      "Current stock": p.currentStock,
      Unit: p.unitSymbol,
      "Reorder level": p.reorderLevel,
      Status:
        p.currentStock <= 0
          ? "Out of stock"
          : p.currentStock <= p.reorderLevel
            ? "Low"
            : "OK",
    }));
    filename = "products";
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  if (format === "xlsx") {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      },
    });
  }

  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
    },
  });
}
