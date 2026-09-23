import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAuthContext, hasRole } from "@/lib/auth";
import { listProducts, listAllMovements } from "@/lib/queries";
import { buildBackup, BACKUP_SHEETS } from "@/lib/backup";
import { fmtDate } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";

/**
 * Neutralise spreadsheet formula injection.
 *
 * Exported cells carry names, notes and references typed by people in the org,
 * and Excel/Sheets treat a leading =, +, -, @ (or a leading tab/CR) as the
 * start of a formula rather than text — so a product called
 * `=HYPERLINK("http://…"&A1)` becomes a live formula in whoever opens the file,
 * including an accountant outside the business. Prefixing an apostrophe forces
 * the cell to text; spreadsheets hide the apostrophe on display. Only strings
 * are touched, so genuine negative numbers are unaffected.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function safeCell(v: unknown): unknown {
  return typeof v === "string" && FORMULA_START.test(v) ? `'${v}` : v;
}

function safeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, safeCell(v)])),
  );
}

/** Only a real YYYY-MM-DD reaches the ::date cast; anything else is ignored. */
function isoDate(v: string | null): string | undefined {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

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
          data.length ? safeRows(data) : [{ [sheet.label]: "No data" }],
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
      from: isoDate(p.get("from")),
      to: isoDate(p.get("to")),
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

  const worksheet = XLSX.utils.json_to_sheet(safeRows(rows));

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
