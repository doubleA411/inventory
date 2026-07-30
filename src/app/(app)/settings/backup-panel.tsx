import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import type { BackupFile } from "@/lib/storage";

export function BackupPanel({
  recent,
}: {
  recent: (BackupFile & { downloadUrl: string })[];
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-(--color-muted)">
          Every product, batch, quotation, invoice, payment and expense in one file. JSON
          keeps the exact data for a future restore; the spreadsheet is for reading.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export?type=backup&format=json" className="btn-outline">
            <FileJson className="h-4 w-4" /> Download JSON
          </a>
          <a href="/api/export?type=backup&format=xlsx" className="btn-outline">
            <FileSpreadsheet className="h-4 w-4" /> Download spreadsheet
          </a>
        </div>
      </div>

      <div className="border-t border-(--color-border) pt-4">
        <h3 className="mb-2 text-sm font-semibold">Scheduled backups</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-(--color-muted)">
            A backup runs automatically every night and will show up here — kept for 30
            days.
          </p>
        ) : (
          <div className="divide-y divide-(--color-border) rounded-lg border border-(--color-border)">
            {recent.map((b) => (
              <div key={b.name} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-(--color-muted)">
                  {fmtDate(b.createdAt)} · {(b.sizeBytes / 1024).toFixed(0)} KB
                </span>
                <a
                  href={b.downloadUrl}
                  className="inline-flex items-center gap-1 text-(--color-primary) hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
