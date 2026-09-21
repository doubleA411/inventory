import Link from "next/link";
import { ArchiveRestore, ArrowLeft, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { listArchivedRecords, type ArchiveKind } from "@/lib/archive";
import { EmptyState, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { restoreArchivedRecord } from "./actions";

const kindLabel: Record<ArchiveKind, string> = {
  product: "Product",
  customer: "Customer",
  vendor: "Vendor",
  expense: "Expense",
  quotation: "Quotation",
  invoice: "Invoice",
  purchase_bill: "Purchase bill",
  purchase_list: "Purchase list",
};

export default async function ArchivePage() {
  const { organization } = await requireRole("admin");
  const records = await listArchivedRecords(organization.id);

  return (
    <div>
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <PageHeader
        title="Archived records"
        subtitle="Recover records removed from day-to-day work. Their history stays intact while archived."
      />

      {records.length === 0 ? (
        <EmptyState
          title="Nothing is archived"
          description="Records you archive will appear here and can be restored at any time."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-(--color-border)">
            {records.map((record) => {
              const action = restoreArchivedRecord.bind(null, record.kind, record.id);
              return (
                <div
                  key={`${record.kind}:${record.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-(--color-warn-soft) p-2 text-(--color-warn)">
                      <ArchiveRestore className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{record.label}</span>
                        <span className="badge bg-(--color-bg) text-(--color-muted)">
                          {kindLabel[record.kind]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-(--color-muted)">
                        {record.detail} · Archived {fmtDate(record.deletedAt)}
                        {record.deletedBy ? ` by ${record.deletedBy}` : ""}
                      </p>
                    </div>
                  </div>
                  <form action={action}>
                    <button className="btn-outline" type="submit">
                      <RotateCcw className="h-4 w-4" /> Restore
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

