import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getPurchaseBillFull } from "@/lib/purchase-queries";
import { Badge } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ArrowLeft, Printer } from "lucide-react";
import { PurchaseBillActions } from "./purchase-bill-actions";
import { BillItems } from "./bill-items";

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
          <BillItems
            billId={id}
            vendorId={vendor?.id ?? null}
            items={items}
            total={bill.total}
            currency={cur}
            editable={!cancelled}
          />
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

          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment history
            </div>
            {payments.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                {due > 0 && !cancelled ? (
                  <>
                    No payments recorded.{" "}
                    {vendor ? (
                      <Link href={`/vendors/${vendor.id}`} className="hover:underline">
                        Record one from {vendor.name}&rsquo;s page.
                      </Link>
                    ) : (
                      "Payments are recorded from the vendor's page."
                    )}
                  </>
                ) : (
                  "No payments recorded."
                )}
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
