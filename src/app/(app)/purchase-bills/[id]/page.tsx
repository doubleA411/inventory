import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getPurchaseBillFull } from "@/lib/purchase-queries";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import { PurchaseBillPaymentForm } from "./payment-form";
import { PurchaseBillActions } from "./purchase-bill-actions";

export default async function PurchaseBillViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const data = await getPurchaseBillFull(organization.id, id);
  if (!data) notFound();
  const { bill, items, vendor, payments } = data;
  const cur = organization.currency;

  const paid = Number(bill.amountPaid);
  const total = Number(bill.total);
  const due = total - paid;
  const cancelled = bill.status === "cancelled";

  return (
    <div>
      <Link
        href={vendor ? `/vendors/${vendor.id}` : "/vendors"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> {vendor ? vendor.name : "Vendors"}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{bill.number}</h1>
            {cancelled ? (
              <Badge tone="default">Cancelled</Badge>
            ) : (
              <Badge tone={due > 0 ? "warn" : "ok"}>{due > 0 ? "Due" : "Paid"}</Badge>
            )}
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">
            {vendor?.name ?? "No vendor"} · {fmtDate(bill.billDate)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/print/purchase-bill/${id}`} className="btn-primary">
            <Printer className="h-4 w-4" /> Print
          </Link>
          <PurchaseBillActions id={id} status={bill.status} vendorId={vendor?.id ?? null} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2">{i.description}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {i.productId ? `${Number(i.quantity)} ${i.unit ?? ""}` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {i.productId ? fmtMoney(i.rate, cur) : "—"}
                      </td>
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
                    <td className="pr-8 pt-1 font-semibold">Total</td>
                    <td className="pt-1 text-right text-base font-semibold tabular-nums">
                      {fmtMoney(bill.total, cur)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          {bill.notes && (
            <p className="text-sm text-(--color-muted)">
              <span className="font-medium text-(--color-fg)">Notes:</span> {bill.notes}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-(--color-muted)">Total</div>
                <div className="font-semibold tabular-nums">{fmtMoney(total, cur)}</div>
              </div>
              <div>
                <div className="text-xs text-(--color-muted)">Paid</div>
                <div className="font-semibold tabular-nums text-(--color-ok)">
                  {fmtMoney(paid, cur)}
                </div>
              </div>
              <div>
                <div className="text-xs text-(--color-muted)">Due</div>
                <div className="font-semibold tabular-nums text-(--color-danger)">
                  {fmtMoney(due, cur)}
                </div>
              </div>
            </div>
          </div>

          {due > 0 && !cancelled && (
            <div className="card p-4">
              <div className="mb-3 text-sm font-semibold">Record a payment</div>
              <PurchaseBillPaymentForm purchaseBillId={id} due={due} />
            </div>
          )}

          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment history
            </div>
            {payments.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No payments recorded.
              </div>
            ) : (
              <div className="divide-y divide-(--color-border)">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <div className="font-medium tabular-nums">{fmtMoney(p.amount, cur)}</div>
                      <div className="text-xs capitalize text-(--color-muted)">
                        {p.method.replace("_", " ")} · {fmtDate(p.paidAt)}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
