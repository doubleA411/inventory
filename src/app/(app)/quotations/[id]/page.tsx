import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getQuotationFull } from "@/lib/billing-queries";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { QUOTE_STATUS_META } from "@/lib/labels";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { QuoteActions } from "./quote-actions";

export default async function QuotationViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization, role } = await requireRole("admin");
  const { id } = await params;
  const data = await getQuotationFull(organization.id, id);
  if (!data) notFound();
  const { quotation, items, customer } = data;
  const cur = organization.currency;
  const meta = QUOTE_STATUS_META[quotation.status];
  const gstEnabled = organization.gstRegistered;
  const approved = !!quotation.approvedAt;
  const isOwner = role === "owner";

  return (
    <div>
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Quotations
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{quotation.number}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">
            {customer?.name ?? "Walk-in"} · {fmtDate(quotation.issueDate)}
            {quotation.validUntil ? ` · valid until ${fmtDate(quotation.validUntil)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approved ? (
            <Link href={`/print/quotation/${id}`} className="btn-outline">
              <Printer className="h-4 w-4" /> Print
            </Link>
          ) : (
            <button className="btn-outline" disabled title="Needs owner approval first">
              <Printer className="h-4 w-4" /> Print
            </button>
          )}
          <Link href={`/quotations/${id}/edit`} className="btn-outline">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <QuoteActions
          id={id}
          status={quotation.status}
          convertedInvoiceId={quotation.convertedInvoiceId}
          approved={approved}
          isOwner={isOwner}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                {gstEnabled && <th className="px-4 py-2 text-right font-medium">Tax%</th>}
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-2">
                    {i.description}
                    {i.hsnSac && (
                      <span className="ml-2 text-xs text-(--color-muted)">{i.hsnSac}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {Number(i.quantity)} {i.unit ?? ""}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(i.rate, cur)}</td>
                  {gstEnabled && (
                    <td className="px-4 py-2 text-right tabular-nums">{Number(i.taxRate)}%</td>
                  )}
                  <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(i.amount, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end border-t border-(--color-border) p-4">
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="pr-8 text-(--color-muted)">Subtotal</td>
                <td className="text-right tabular-nums">{fmtMoney(quotation.subtotal, cur)}</td>
              </tr>
              {gstEnabled && (
                <tr>
                  <td className="pr-8 text-(--color-muted)">Tax</td>
                  <td className="text-right tabular-nums">{fmtMoney(quotation.taxTotal, cur)}</td>
                </tr>
              )}
              <tr className="border-t border-(--color-border)">
                <td className="pr-8 pt-1 font-semibold">Total</td>
                <td className="pt-1 text-right text-base font-semibold tabular-nums">
                  {fmtMoney(quotation.total, cur)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
