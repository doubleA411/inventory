import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getPurchaseListFull } from "@/lib/purchase-list-queries";
import { normalizeIndianMobile, waLink } from "@/lib/sharing";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/utils";
import { PURCHASE_LIST_STATUS_META } from "@/lib/labels";
import { ArrowLeft, Printer, Download, MessageCircle, Pencil } from "lucide-react";
import { PurchaseListActions } from "./purchase-list-actions";

export default async function PurchaseListViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const data = await getPurchaseListFull(organization.id, id);
  if (!data) notFound();
  const { list, items, vendor } = data;
  const meta = PURCHASE_LIST_STATUS_META[list.status];
  const waPhone = vendor ? normalizeIndianMobile(vendor.phone) : null;

  return (
    <div>
      <Link
        href={vendor ? `/vendors/${vendor.id}` : "/purchase-lists"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> {vendor ? vendor.name : "Purchase lists"}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{list.number}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">
            {vendor?.name ?? "No vendor"} · {fmtDate(list.listDate)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {list.status === "draft" && (
            <Link href={`/purchase-lists/${id}/edit`} className="btn-outline">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          <Link href={`/print/purchase-list/${id}`} className="btn-outline">
            <Printer className="h-4 w-4" /> Print
          </Link>
          <a href={`/api/documents/purchase-list/${id}`} className="btn-primary">
            <Download className="h-4 w-4" /> Download PDF
          </a>
          {waPhone && (
            <a
              href={waLink(
                waPhone,
                `Hi ${vendor?.name}, sharing our purchase list ${list.number} — please find the PDF attached.`,
              )}
              target="_blank"
              rel="noreferrer"
              className="btn-outline"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          <PurchaseListActions id={id} status={list.status} vendorId={vendor?.id ?? null} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 font-medium">Unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">{i.description}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(i.quantity)}</td>
                  <td className="px-4 py-2 text-(--color-muted)">{i.unit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {list.notes && (
        <p className="mt-4 text-sm text-(--color-muted)">
          <span className="font-medium text-(--color-fg)">Notes:</span> {list.notes}
        </p>
      )}
    </div>
  );
}
