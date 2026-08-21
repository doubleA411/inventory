"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { UploadCloud, FileDown, CheckCircle2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui";
import { importProductsAction } from "./actions";
import type { ImportRow, ImportResult } from "@/lib/import-products";

const TARGET_FIELDS: {
  key: keyof ImportRow;
  label: string;
  required?: boolean;
  guesses: string[];
}[] = [
  { key: "name", label: "Product name", required: true, guesses: ["name", "product", "item"] },
  { key: "code", label: "Code / SKU", guesses: ["code", "sku", "id"] },
  { key: "category", label: "Category", guesses: ["category", "type", "group"] },
  { key: "unit", label: "Unit", required: true, guesses: ["unit", "uom", "measure"] },
  { key: "openingStock", label: "Opening stock", guesses: ["opening", "stock", "quantity", "qty", "onhand"] },
  { key: "reorderLevel", label: "Reorder level", guesses: ["reorder", "min", "threshold"] },
  { key: "expiryDate", label: "Expiry date", guesses: ["expiry", "expire", "bestbefore"] },
  { key: "costPrice", label: "Cost price", guesses: ["cost", "price", "rate"] },
];

const TEMPLATE_HEADERS = [
  "name",
  "code",
  "category",
  "unit",
  "opening_stock",
  "reorder_level",
  "expiry_date",
  "cost_price",
];

function guessColumn(header: string[], guesses: string[]): string | "" {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const g of guesses) {
    const hit = header.find((h) => norm(h).includes(norm(g)));
    if (hit) return hit;
  }
  return "";
}

export function ImportTool({
  units,
  existingNames,
}: {
  units: { symbol: string; name: string }[];
  existingNames: string[];
}) {
  const router = useRouter();
  const [fileError, setFileError] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const knownUnits = useMemo(() => {
    const s = new Set<string>();
    units.forEach((u) => {
      s.add(u.symbol.toLowerCase());
      s.add(u.name.toLowerCase());
    });
    return s;
  }, [units]);

  const knownProductNames = useMemo(
    () => new Set(existingNames.map((n) => n.toLowerCase())),
    [existingNames],
  );

  async function onFile(file: File) {
    setResult(null);
    setFileName(file.name);
    // .csv has no embedded encoding — reading it as raw bytes makes SheetJS
    // guess a legacy codepage and mangle any non-ASCII text (Tamil, etc).
    // file.text() decodes as UTF-8 (the near-universal CSV export encoding)
    // via the browser's native decoder, which is always correct. .xlsx/.xls
    // don't have this ambiguity — they encode text in the container format
    // itself — so those keep going through arrayBuffer as before.
    const isCsv = /\.csv$/i.test(file.name);
    const wb = isCsv
      ? XLSX.read(await file.text(), { type: "string", cellDates: false })
      : XLSX.read(await file.arrayBuffer(), { cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
      defval: "",
      raw: false,
    });
    if (json.length === 0) {
      setFileError(
        "That file has no rows in it. Check you saved the sheet with your data on the first tab.",
      );
      return;
    }
    setFileError(null);
    const hdrs = Object.keys(json[0]);
    setHeaders(hdrs);
    setRows(json);
    // Auto-map.
    const auto: Record<string, string> = {};
    for (const f of TARGET_FIELDS) {
      auto[f.key] = guessColumn(hdrs, f.guesses);
    }
    setMapping(auto);
  }

  const normalized: ImportRow[] = useMemo(() => {
    return rows.map((r) => {
      const out: ImportRow = {};
      for (const f of TARGET_FIELDS) {
        const src = mapping[f.key];
        if (src) (out as Record<string, string>)[f.key] = String(r[src] ?? "").trim();
      }
      return out;
    });
  }, [rows, mapping]);

  // How many times each name appears in this file — so every row sharing a
  // name gets flagged, not just the second-and-later occurrences.
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of normalized) {
      const key = (r.name ?? "").trim().toLowerCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [normalized]);

  const rowIssues = useMemo(() => {
    return normalized.map((r) => {
      const issues: string[] = [];
      if (!r.name) {
        issues.push("no name");
      } else {
        const key = r.name.trim().toLowerCase();
        if (knownProductNames.has(key)) issues.push("already in your product list");
        else if ((nameCounts.get(key) ?? 0) > 1) issues.push("duplicate name in this file");
      }
      const u = String(r.unit ?? "").toLowerCase();
      if (!u) issues.push("no unit");
      else if (!knownUnits.has(u)) issues.push(`unknown unit "${r.unit}"`);
      return issues;
    });
  }, [normalized, knownUnits, knownProductNames, nameCounts]);

  const validCount = rowIssues.filter((i) => i.length === 0).length;

  async function doImport() {
    setBusy(true);
    const res = await importProductsAction(normalized);
    setBusy(false);
    setResult(res);
    router.refresh();
  }

  function downloadTemplate() {
    const example = [
      "Onion,VEG-001,Vegetables,kg,50,10,,30",
      "Cooking Oil,OIL-001,Oils & Ghee,L,20,5,2026-12-31,140",
      "Paneer,DRY-002,Dairy,kg,8,3,2026-07-28,320",
    ];
    const csv = [TEMPLATE_HEADERS.join(","), ...example].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stackwise-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Export + template row */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-sm font-semibold">Export your data</div>
          <div className="text-sm text-(--color-muted)">
            Download your current inventory or full stock history.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export?type=products&format=csv" className="btn-outline">
            <FileDown className="h-4 w-4" /> Products CSV
          </a>
          <a href="/api/export?type=products&format=xlsx" className="btn-outline">
            <FileDown className="h-4 w-4" /> Products XLSX
          </a>
          <a href="/print/report/products" className="btn-outline">
            <FileDown className="h-4 w-4" /> Products PDF
          </a>
          <a href="/api/export?type=movements&format=csv" className="btn-outline">
            <FileDown className="h-4 w-4" /> History CSV
          </a>
          <a href="/print/report/stock-history" className="btn-outline">
            <FileDown className="h-4 w-4" /> History PDF
          </a>
        </div>
      </div>

      {/* Import */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">Import products</div>
            <div className="text-sm text-(--color-muted)">
              Upload a CSV or XLSX file. We&apos;ll help you map the columns.
            </div>
          </div>
          <button className="btn-outline" onClick={downloadTemplate}>
            <FileDown className="h-4 w-4" /> Download template
          </button>
        </div>

        {fileError && (
          <p className="mb-3 rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {fileError}
          </p>
        )}

        {rows.length === 0 ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-(--color-border) px-6 py-12 text-center hover:border-(--color-primary)">
            <UploadCloud className="h-8 w-8 text-(--color-muted)" />
            <span className="text-sm font-medium">Click to choose a file</span>
            <span className="text-xs text-(--color-muted)">.csv, .xlsx, .xls</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg bg-(--color-bg) px-3 py-2 text-sm">
              <span className="font-medium">{fileName}</span>
              <button
                className="text-(--color-muted) hover:text-(--color-fg)"
                onClick={() => {
                  setRows([]);
                  setHeaders([]);
                  setResult(null);
                }}
              >
                Choose a different file
              </button>
            </div>

            {/* Mapping */}
            <div>
              <div className="mb-2 text-sm font-semibold">Map columns</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {TARGET_FIELDS.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 text-sm">
                      {f.label}
                      {f.required && <span className="text-(--color-danger)"> *</span>}
                    </span>
                    <select
                      className="input"
                      value={mapping[f.key] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                      }
                    >
                      <option value="">— none —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Preview ({rows.length} rows)
                </div>
                <div className="text-sm">
                  <span className="text-(--color-ok)">{validCount} ready</span>
                  {validCount < rows.length && (
                    <span className="text-(--color-danger)">
                      {" · "}
                      {rows.length - validCount} with issues
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-72 overflow-auto rounded-lg border border-(--color-border)">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-(--color-surface)">
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase text-(--color-muted)">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Unit</th>
                      <th className="px-3 py-2 font-medium">Opening</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {normalized.slice(0, 100).map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 text-(--color-muted)">{i + 1}</td>
                        <td className="px-3 py-1.5">{r.name || "—"}</td>
                        <td className="px-3 py-1.5">{r.unit || "—"}</td>
                        <td className="px-3 py-1.5">{r.openingStock || "0"}</td>
                        <td className="px-3 py-1.5">
                          {rowIssues[i].length === 0 ? (
                            <Badge tone="ok">ready</Badge>
                          ) : (
                            <Badge tone="danger">{rowIssues[i].join(", ")}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 100 && (
                <p className="mt-1 text-xs text-(--color-muted)">
                  Showing first 100 rows. All {rows.length} will be imported.
                </p>
              )}
            </div>

            {result ? (
              <div className="rounded-lg bg-(--color-ok-soft) p-4">
                <div className="flex items-center gap-2 font-medium text-(--color-ok)">
                  <CheckCircle2 className="h-5 w-5" />
                  Imported {result.inserted} product
                  {result.inserted === 1 ? "" : "s"}.
                </div>
                {result.errors.length > 0 && (
                  <div className="mt-2 text-sm text-(--color-danger)">
                    <div className="flex items-center gap-1 font-medium">
                      <AlertTriangle className="h-4 w-4" />
                      {result.errors.length} row(s) skipped:
                    </div>
                    <ul className="ml-5 mt-1 list-disc">
                      {result.errors.slice(0, 8).map((e, i) => (
                        <li key={i}>
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <a href="/products" className="btn-primary mt-3">
                  View products
                </a>
              </div>
            ) : (
              <button
                className="btn-primary"
                onClick={doImport}
                disabled={busy || validCount === 0}
              >
                {busy ? "Importing…" : `Import ${validCount} product${validCount === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
