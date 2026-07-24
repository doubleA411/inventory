import { fmtDate } from "@/lib/utils";

export type ReportColumn = { label: string; align?: "left" | "right" };

export function ReportView({
  orgName,
  title,
  meta,
  columns,
  rows,
  totalRow,
}: {
  orgName: string;
  title: string;
  meta?: { label: string; value: string }[];
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
}) {
  return (
    <div className="a4-page">
      <div className="a4-content">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
          <div>
            <div className="text-lg font-bold">{orgName}</div>
            <div className="text-sm text-gray-600">{title}</div>
          </div>
          <div className="text-right text-xs text-gray-500">
            Generated {fmtDate(new Date())}
          </div>
        </div>

        {meta && meta.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
            {meta.map((m) => (
              <span key={m.label}>
                <span className="text-gray-400">{m.label}:</span> {m.value}
              </span>
            ))}
          </div>
        )}

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-gray-400 bg-gray-50 text-left">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-2 py-1.5 font-semibold ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-gray-200">
                {r.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-2 py-1.5 ${columns[ci]?.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="border-t-2 border-gray-400 font-semibold">
                {totalRow.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`px-2 py-2 ${columns[ci]?.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>

        {rows.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-500">
            No records for the selected filters.
          </div>
        )}
      </div>
    </div>
  );
}
