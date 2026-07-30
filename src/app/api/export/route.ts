import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthContext, hasRole } from "@/lib/auth";
import { listProducts, listAllMovements } from "@/lib/queries";
import { buildBackup, BACKUP_SHEETS } from "@/lib/backup";
import { fmtDate } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? "products";
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const orgId = ctx.organization.id;

  // Full backup carries every table for the org, including customer and
  // payment records — restrict to admins/owners, not any signed-in staff.
  if (type === "backup") {
    if (!hasRole(ctx.role, "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const backup = await buildBackup(orgId);
    const stamp = backup.meta.exportedAt.slice(0, 10);

    if (format === "xlsx") {
      const workbook = XLSX.utils.book_new();
      for (const sheet of BACKUP_SHEETS) {
        const data = backup[sheet.key] as Record<string, unknown>[];
        const worksheet = XLSX.utils.json_to_sheet(
          data.length ? data : [{ [sheet.label]: "No data" }],
        );
        XLSX.utils.book_append_sheet(workbook, worksheet, sheet.label.slice(0, 31));
      }
      const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="stackwise-backup-${stamp}.xlsx"`,
        },
      });
    }

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="stackwise-backup-${stamp}.json"`,
      },
    });
  }

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
