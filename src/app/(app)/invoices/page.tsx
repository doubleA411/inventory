import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listInvoices, billingSummary, displayInvoiceStatus } from "@/lib/billing-queries";
import { PageHeader, StatCard, Badge, EmptyState, DateFilter } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { INVOICE_STATUS_META } from "@/lib/labels";
import { Plus } from "lucide-react";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const [rows, summary] = await Promise.all([
    listInvoices(organization.id, { from: sp.from, to: sp.to }),
    billingSummary(organization.id),
  ]);
  const cur = organization.currency;

  return (
    <div>
      <PageHeader
        title="Invoices & Bills"
        subtitle="Create GST invoices, track payments and overdue bills."
        action={
          <Link href="/invoices/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New invoice
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Invoices" value={summary.invoiceCount} />
        <StatCard
          label="Outstanding"
          value={fmtMoney(summary.outstanding, cur)}
          tone={summary.outstanding > 0 ? "warn" : "default"}
        />
        <StatCard
          label="Overdue"
          value={fmtMoney(summary.overdueAmount, cur)}
          hint={`${summary.overdueCount} invoice${summary.overdueCount === 1 ? "" : "s"}`}
          tone={summary.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      <DateFilter basePath="/invoices" from={sp.from} to={sp.to} />

      {rows.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Create your first GST invoice or bill."
          action={
            <Link href="/invoices/new" className="btn-primary">
              New invoice
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {rows.map((r) => {
                  const st = displayInvoiceStatus(r);
                  const meta = INVOICE_STATUS_META[st];
                  const due = Number(r.total) - Number(r.amountPaid);
                  return (
                    <tr key={r.id} className="hover:bg-(--color-bg)">
                      <td className="px-4 py-3">
                        <Link href={`/invoices/${r.id}`} className="font-medium hover:underline">
                          {r.number}
                        </Link>
                        {r.docType === "bill_of_supply" && (
                          <span className="ml-2 text-xs text-(--color-muted)">Bill</span>
                        )}
                        {!r.approvedAt && (
                          <span className="ml-2 text-xs text-(--color-warn)">• Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">{r.customerName ?? "—"}</td>
                      <td className="px-4 py-3 text-(--color-muted)">{fmtDate(r.issueDate)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.total, cur)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {due > 0 ? fmtMoney(due, cur) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
