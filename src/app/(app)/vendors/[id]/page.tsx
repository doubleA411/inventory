import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  getVendor,
  listPurchaseBillsForVendor,
  listPaymentsForVendor,
} from "@/lib/purchase-queries";
import { PageHeader, Badge } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ArrowLeft, Plus } from "lucide-react";
import { VendorPaymentForm } from "./payment-form";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const [vendor, bills, payments] = await Promise.all([
    getVendor(organization.id, id),
    listPurchaseBillsForVendor(organization.id, id),
    listPaymentsForVendor(organization.id, id),
  ]);
  if (!vendor) notFound();
  const cur = organization.currency;

  const activeBills = bills.filter((b) => b.status === "active");
  const purchased = activeBills.reduce((s, b) => s + Number(b.total), 0);
  const paid = activeBills.reduce((s, b) => s + Number(b.amountPaid), 0);
  const openingBalance = Number(vendor.openingBalance);
  const due = purchased - paid + openingBalance;

  return (
    <div>
      <Link
        href="/vendors"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Vendors
      </Link>

      <PageHeader
        title={vendor.name}
        subtitle={[vendor.location, vendor.district].filter(Boolean).join(", ")}
        action={
          <Link href={`/purchase-bills/new?vendorId=${vendor.id}`} className="btn-primary">
            <Plus className="h-4 w-4" /> New purchase bill
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-(--color-muted)">Purchased</div>
                <div className="font-semibold tabular-nums">{fmtMoney(purchased, cur)}</div>
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
            {openingBalance > 0 && (
              <div className="mt-3 border-t border-(--color-border) pt-2 text-center text-xs text-(--color-muted)">
                Includes opening balance of {fmtMoney(openingBalance, cur)}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Purchase bills
            </div>
            {bills.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No purchase bills yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Bill</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-right font-medium">Due</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {bills.map((b) => {
                      const billDue = Number(b.total) - Number(b.amountPaid);
                      return (
                        <tr key={b.id} className="hover:bg-(--color-bg)">
                          <td className="px-4 py-2.5">
                            <Link href={`/purchase-bills/${b.id}`} className="font-medium hover:underline">
                              {b.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(b.billDate)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(b.total, cur)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {b.status === "active" && billDue > 0 ? fmtMoney(billDue, cur) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={b.status === "cancelled" ? "default" : billDue > 0 ? "warn" : "ok"}>
                              {b.status === "cancelled" ? "Cancelled" : billDue > 0 ? "Due" : "Paid"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment tracking
            </div>
            {payments.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No payments recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Date paid</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Bill</th>
                      <th className="px-4 py-2 font-medium">Method</th>
                      <th className="px-4 py-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-(--color-bg)">
                        <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(p.paidAt)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                          {fmtMoney(p.amount, cur)}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.billId ? (
                            <Link href={`/purchase-bills/${p.billId}`} className="hover:underline">
                              {p.billNumber}
                            </Link>
                          ) : (
                            <span className="text-(--color-muted)">
                              {p.note?.includes("opening balance") ? "Opening balance" : "Advance / credit"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-muted) capitalize">
                          {p.method.replace("_", " ")}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-muted)">
                          {p.reference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {due > 0 && (
            <div className="card p-4">
              <div className="mb-3 text-sm font-semibold">Record a payment</div>
              <VendorPaymentForm vendorId={vendor.id} due={due} />
            </div>
          )}

          <div className="card space-y-2 p-4 text-sm">
            <div className="font-semibold">Vendor details</div>
            <div className="text-(--color-muted)">GSTIN: {vendor.gstin || "—"}</div>
            <div className="text-(--color-muted)">Address: {vendor.addressLine || "—"}</div>
            <div className="text-(--color-muted)">PIN: {vendor.pincode || "—"}</div>
            <div className="text-(--color-muted)">Ph: {vendor.phone || "—"}</div>
            <div className="text-(--color-muted)">Email: {vendor.email || "—"}</div>
            <div className="text-(--color-muted)">
              Opening balance: {fmtMoney(vendor.openingBalance, cur)}
            </div>
            <div className="text-(--color-muted)">Notes: {vendor.notes || "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
