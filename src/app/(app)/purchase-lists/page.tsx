import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { listAllPurchaseLists } from "@/lib/purchase-list-queries";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { ClickableRow, stopRowClick } from "@/components/clickable-row";
import { fmtDate } from "@/lib/utils";
import { PURCHASE_LIST_STATUS_META } from "@/lib/labels";
import { Plus } from "lucide-react";

export default async function PurchaseListsPage() {
  const { organization } = await requireRole("admin");
  const rows = await listAllPurchaseLists(organization.id);

  return (
    <div>
      <PageHeader
        title="Purchase list"
        subtitle="Ask a vendor to supply what you need, then send it to them as a PDF."
        action={
          <Link href="/vendors" className="btn-primary">
            <Plus className="h-4 w-4" /> New purchase list
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No purchase lists yet"
          description="Create one from a vendor's page to ask them to supply their preferred products."
          action={
            <Link href="/vendors" className="btn-primary">
              Go to vendors
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
                  <th className="px-4 py-3 font-medium">Vendor</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {rows.map((r) => {
                  const meta = PURCHASE_LIST_STATUS_META[r.status];
                  return (
                    <ClickableRow
                      key={r.id}
                      href={`/purchase-lists/${r.id}`}
                      className="hover:bg-(--color-bg)"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/purchase-lists/${r.id}`}
                          onClick={stopRowClick}
                          className="font-medium hover:underline"
                        >
                          {r.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">
                        {r.vendorId ? (
                          <Link
                            href={`/vendors/${r.vendorId}`}
                            onClick={stopRowClick}
                            className="hover:underline"
                          >
                            {r.vendorName}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">{fmtDate(r.listDate)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                    </ClickableRow>
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
