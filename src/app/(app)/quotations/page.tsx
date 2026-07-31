import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listQuotations } from "@/lib/billing-queries";
import { PageHeader, Badge, EmptyState, DateFilter } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { QUOTE_STATUS_META } from "@/lib/labels";
import { Plus } from "lucide-react";

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; search?: string }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const rows = await listQuotations(organization.id, {
    from: sp.from,
    to: sp.to,
    search: sp.search,
  });
  const cur = organization.currency;

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Create tariff estimates and convert accepted ones into invoices."
        action={
          <Link href="/quotations/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New quotation
          </Link>
        }
      />

      <DateFilter basePath="/quotations" from={sp.from} to={sp.to} />

      <div className="mb-4">
        <SearchBox
          basePath="/quotations"
          defaultValue={sp.search ?? ""}
          otherParams={{ from: sp.from, to: sp.to }}
          placeholder="Search by number or customer…"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={sp.search ? "No matching quotations" : "No quotations yet"}
          description={
            sp.search ? "Try a different search." : "Send your first tariff / quotation to a customer."
          }
          action={
            <Link href="/quotations/new" className="btn-primary">
              New quotation
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
                  <th className="px-4 py-3 font-medium">Valid until</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {rows.map((r) => {
                  const meta = QUOTE_STATUS_META[r.status];
                  return (
                    <tr key={r.id} className="hover:bg-(--color-bg)">
                      <td className="px-4 py-3">
                        <Link href={`/quotations/${r.id}`} className="font-medium hover:underline">
                          {r.number}
                        </Link>
                        {!r.approvedAt && (
                          <span className="ml-2 text-xs text-(--color-warn)">• Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">{r.customerName ?? "—"}</td>
                      <td className="px-4 py-3 text-(--color-muted)">{fmtDate(r.issueDate)}</td>
                      <td className="px-4 py-3 text-(--color-muted)">{fmtDate(r.validUntil)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(r.total, cur)}</td>
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
