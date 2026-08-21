import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  getVendor,
  listPurchaseBillsForVendor,
  listPaymentsForVendor,
} from "@/lib/purchase-queries";
import { listPurchaseListsForVendor } from "@/lib/purchase-list-queries";
import { PageHeader } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { ArrowLeft, Plus } from "lucide-react";
import { VendorPaymentForm } from "./payment-form";
import { VendorPurchasingTabs } from "./purchasing-tabs";
import { computeVendorBalance, vendorPaymentTotals } from "@/lib/purchase-queries";
import { vendorActivity } from "@/lib/activity";
import { UseCreditButton } from "./use-credit-button";
import { VendorPaymentHistory } from "./payment-history";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const [vendor, bills, payments, purchaseLists, activity] = await Promise.all([
    getVendor(organization.id, id),
    listPurchaseBillsForVendor(organization.id, id),
    listPaymentsForVendor(organization.id, id),
    listPurchaseListsForVendor(organization.id, id),
    vendorActivity(organization.id, id),
  ]);
  if (!vendor) notFound();
  const cur = organization.currency;

  const activeBills = bills.filter((b) => b.status === "active");
  // Every rupee counted exactly once — bill payments, opening-balance
  // payments and unattached credit all flow through one helper so this header
  // can't disagree with the vendors list or the payables total.
  const totals = await vendorPaymentTotals(organization.id, id);
  // Only worth offering when a bill is actually sitting unpaid — that is the
  // contradiction this resolves.
  const hasUnpaidBill = activeBills.some((b) => Number(b.total) - Number(b.amountPaid) > 0);
  const balance = computeVendorBalance({
    purchased: activeBills.reduce((s, b) => s + Number(b.total), 0),
    billsPaid: activeBills.reduce((s, b) => s + Number(b.amountPaid), 0),
    openingEntered: Number(vendor.openingBalance),
    openingPaid: totals.openingBalance,
    credit: totals.credit,
  });

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
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/purchase-lists/new?vendorId=${vendor.id}`} className="btn-outline">
              <Plus className="h-4 w-4" /> New purchase list
            </Link>
            <Link href={`/purchase-bills/new?vendorId=${vendor.id}`} className="btn-primary">
              <Plus className="h-4 w-4" /> New purchase bill
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-(--color-muted)">Purchased</div>
                <div className="font-semibold tabular-nums">
                  {fmtMoney(balance.purchased, cur)}
                </div>
              </div>
              <div>
                <div className="text-xs text-(--color-muted)">Paid</div>
                <div className="font-semibold tabular-nums text-(--color-ok)">
                  {fmtMoney(balance.paid, cur)}
                </div>
              </div>
              <div>
                {/* Never a negative "due". Money the vendor is holding is a
                    different fact from money owed, so it gets its own word. */}
                <div className="text-xs text-(--color-muted)">
                  {balance.credit > 0 ? "In credit" : "Due"}
                </div>
                <div
                  className={
                    balance.credit > 0
                      ? "font-semibold tabular-nums text-(--color-ok)"
                      : "font-semibold tabular-nums text-(--color-danger)"
                  }
                >
                  {fmtMoney(balance.credit > 0 ? balance.credit : balance.due, cur)}
                </div>
              </div>
            </div>
            {(balance.openingEntered > 0 || balance.credit > 0) && (
              <div className="mt-3 space-y-1 border-t border-(--color-border) pt-2 text-center text-xs text-(--color-muted)">
                {balance.openingEntered > 0 && (
                  <div>
                    Carried-over balance when you added them:{" "}
                    {fmtMoney(balance.openingEntered, cur)}
                    {balance.openingRemaining < balance.openingEntered &&
                      ` · ${fmtMoney(balance.openingRemaining, cur)} of it still unpaid`}
                  </div>
                )}
                {balance.credit > 0 && (
                  // Says what is true today: the money is counted and safe.
                  // It is not yet applied to individual bills automatically,
                  // so this deliberately doesn't promise that it will be.
                  <div className="text-(--color-ok)">
                    {vendor.name} is holding {fmtMoney(balance.credit, cur)}{" "}
                    of yours from an earlier payment. It&rsquo;s already counted above, so you
                    owe them nothing right now.
                    {hasUnpaidBill && (
                      <UseCreditButton
                        vendorId={vendor.id}
                        credit={balance.credit}
                        currency={cur}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <VendorPurchasingTabs bills={bills} purchaseLists={purchaseLists} currency={cur} />

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment tracking
            </div>
            <VendorPaymentHistory
              vendorId={vendor.id}
              currency={cur}
              payments={payments.map((p) => ({
                id: p.id,
                amount: p.amount,
                method: p.method,
                reference: p.reference,
                paidAt: p.paidAt,
                recordedAt: p.createdAt.toISOString(),
                billId: p.billId,
                billNumber: p.billNumber,
                appliedToOpeningBalance: p.appliedTo === "opening_balance",
              }))}
            />
            {activity.length > 0 && (
              // Reversing a vendor payment deletes its rows outright, so
              // without this the money leaves the ledger with no record of who
              // took it off. Written by reverseVendorPaymentCore.
              <div className="border-t border-(--color-border) px-4 py-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted)">
                  Changes to payments
                </div>
                <ul className="space-y-1.5">
                  {activity.map((a) => (
                    <li key={a.id} className="text-xs text-(--color-muted)">
                      {a.summary} — {a.userName ?? "a removed user"} on{" "}
                      {fmtDate(a.createdAt.toISOString())}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Always available. Hiding it when nothing is owed reads as a bug,
              and paying a vendor ahead of the next load is normal. */}
          <div className="card p-4">
            <div className="mb-3 text-sm font-semibold">Record a payment</div>
            {balance.due <= 0 && (
              <p className="mb-3 text-xs text-(--color-muted)">
                Nothing owed right now
                {balance.credit > 0
                  ? ` — they already hold ${fmtMoney(balance.credit, cur)} of yours, and anything you pay adds to it.`
                  : " — anything you pay will be kept as credit with them."}
              </p>
            )}
            <VendorPaymentForm vendorId={vendor.id} due={balance.due} />
          </div>

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
