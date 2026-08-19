"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { reverseVendorPayment } from "../actions";

export type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  paidAt: string;
  /** Rows recorded together share this — see reverseVendorPaymentCore. */
  recordedAt: string;
  billId: string | null;
  billNumber: string | null;
  appliedToOpeningBalance: boolean;
};

/**
 * Payment tracking, with a way to take a payment back off the books.
 *
 * A payment is recorded against the vendor and auto-allocated across their
 * open bills, so one ₹5,000 payment can show up here as three rows. Reversing
 * any of them reverses the whole recording — the confirm says so when there's
 * more than one row involved, since the total removed is more than the row the
 * user clicked.
 */
export function VendorPaymentHistory({
  vendorId,
  payments,
  currency,
}: {
  vendorId: string;
  payments: PaymentRow[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // How much each recording came to in total, and how many rows it became.
  const recordings = useMemo(() => {
    const map = new Map<string, { rows: number; total: number }>();
    for (const p of payments) {
      const prev = map.get(p.recordedAt) ?? { rows: 0, total: 0 };
      map.set(p.recordedAt, { rows: prev.rows + 1, total: prev.total + Number(p.amount) });
    }
    return map;
  }, [payments]);

  function reverse(paymentId: string) {
    setError(null);
    start(async () => {
      const result = await reverseVendorPayment(paymentId, vendorId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  if (payments.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
        No payments recorded yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
            <th className="px-4 py-2 font-medium">Date paid</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Bill</th>
            <th className="px-4 py-2 font-medium">Method</th>
            <th className="px-4 py-2 font-medium">Reference</th>
            <th className="w-10 px-2 py-2" aria-label="Reverse" />
          </tr>
        </thead>
        <tbody className="divide-y divide-(--color-border)">
          {payments.map((p) => {
            const recording = recordings.get(p.recordedAt) ?? { rows: 1, total: Number(p.amount) };
            const open = openId === p.id;
            return (
              <Fragment key={p.id}>
                <tr className="hover:bg-(--color-bg)">
                  <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(p.paidAt)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {fmtMoney(p.amount, currency)}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.billId ? (
                      <Link href={`/purchase-bills/${p.billId}`} className="hover:underline">
                        {p.billNumber}
                      </Link>
                    ) : (
                      <span className="text-(--color-muted)">
                        {p.appliedToOpeningBalance ? "Opening balance" : "Advance / credit"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 capitalize text-(--color-muted)">
                    {p.method.replace("_", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-(--color-muted)">{p.reference || "—"}</td>
                  <td className="px-2 py-2.5 text-right">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={pending}
                      aria-expanded={open}
                      title="Reverse this payment"
                      onClick={() => {
                        setError(null);
                        setOpenId(open ? null : p.id);
                      }}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={6} className="bg-(--color-bg) px-4 py-3">
                      <div className="space-y-3">
                        <div className="text-sm font-medium">
                          Reverse this payment of {fmtMoney(recording.total, currency)}?
                        </div>
                        {error && <p className="text-sm text-(--color-danger)">{error}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="btn-outline text-(--color-danger)"
                            disabled={pending}
                            onClick={() => reverse(p.id)}
                          >
                            {pending ? "Reversing…" : "Reverse payment"}
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            disabled={pending}
                            onClick={() => setOpenId(null)}
                          >
                            Keep it
                          </button>
                        </div>
                        <p className="text-xs text-(--color-muted)">
                          {recording.rows > 1 ? (
                            <>
                              This was recorded as one payment and split across {recording.rows}{" "}
                              entries — all of them go, and every bill it paid goes back to being
                              due.
                            </>
                          ) : (
                            <>
                              The amount comes off {p.billId ? "the bill it paid" : "this vendor"},
                              which goes back to being due. Stock and bills themselves aren&rsquo;t
                              touched.
                            </>
                          )}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
