"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { PURCHASE_LIST_STATUS_META } from "@/lib/labels";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Bill = {
  id: string;
  number: string;
  billDate: string;
  total: string;
  amountPaid: string;
  status: string;
};
type PurchaseList = {
  id: string;
  number: string;
  listDate: string;
  status: string;
};

export function VendorPurchasingTabs({
  bills,
  purchaseLists,
  currency,
}: {
  bills: Bill[];
  purchaseLists: PurchaseList[];
  currency: string;
}) {
  const [tab, setTab] = useState<"bills" | "lists">("bills");

  return (
    <div className="card overflow-hidden">
      <div role="tablist" className="flex items-center gap-6 border-b border-(--color-border) px-4">
        <TabButton active={tab === "bills"} onClick={() => setTab("bills")}>
          Purchase bills
          {bills.length > 0 && (
            <span className="ml-1.5 text-(--color-muted)">({bills.length})</span>
          )}
        </TabButton>
        <TabButton active={tab === "lists"} onClick={() => setTab("lists")}>
          Purchase lists
          {purchaseLists.length > 0 && (
            <span className="ml-1.5 text-(--color-muted)">({purchaseLists.length})</span>
          )}
        </TabButton>
      </div>

      {tab === "bills" ? (
        bills.length === 0 ? (
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
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtMoney(b.total, currency)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {b.status === "active" && billDue > 0 ? fmtMoney(billDue, currency) : "—"}
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
        )
      ) : purchaseLists.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
          No purchase lists yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-2 font-medium">List</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {purchaseLists.map((pl) => {
                const meta = PURCHASE_LIST_STATUS_META[pl.status];
                return (
                  <tr key={pl.id} className="hover:bg-(--color-bg)">
                    <td className="px-4 py-2.5">
                      <Link href={`/purchase-lists/${pl.id}`} className="font-medium hover:underline">
                        {pl.number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(pl.listDate)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors",
        active
          ? "border-(--color-primary) text-(--color-fg)"
          : "border-transparent text-(--color-muted) hover:text-(--color-fg)",
      )}
    >
      {children}
    </button>
  );
}
