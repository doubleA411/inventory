"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Undo2 } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { restoreInvoicePayment, reverseInvoicePayment } from "../actions";

export type PaymentRow = {
  id: string;
  amount: string;
  method: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
  reversedAt: Date | null;
};

/**
 * Payment history, with a way to take a mistakenly recorded payment back off
 * the invoice. Unlike a vendor payment, an invoice payment is always exactly
 * one row against exactly one invoice — no splitting to undo — so reversing
 * just marks the row reversed and gives the amount back to the balance due.
 * Reversed payments stay listed, struck through, with a way to restore them.
 */
export function InvoicePaymentHistory({
  invoiceId,
  payments,
  currency,
}: {
  invoiceId: string;
  payments: PaymentRow[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function restore(paymentId: string) {
    setError(null);
    start(async () => {
      const result = await restoreInvoicePayment(paymentId, invoiceId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function reverse(paymentId: string) {
    setError(null);
    start(async () => {
      const result = await reverseInvoicePayment(paymentId, invoiceId);
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
        No payments recorded.
      </div>
    );
  }

  return (
    <div className="divide-y divide-(--color-border)">
      {error && !openId && (
        <p className="px-4 py-2 text-sm text-(--color-danger)">{error}</p>
      )}
      {payments.map((p) => {
        const open = openId === p.id;
        if (p.reversedAt) {
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="text-(--color-muted)">
                <div className="font-medium tabular-nums line-through">
                  {fmtMoney(p.amount, currency)}
                </div>
                <div className="text-xs capitalize">
                  {p.method.replace("_", " ")} · {fmtDate(p.paidAt)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </div>
                <div className="mt-0.5 text-xs normal-case">
                  Reversed {fmtDate(p.reversedAt)} — not counted toward this invoice
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                disabled={pending}
                title="Restore this payment"
                onClick={() => restore(p.id)}
              >
                <RotateCcw className="h-4 w-4" />
                <span className="sr-only">Restore payment</span>
              </button>
            </div>
          );
        }
        return (
          <div key={p.id}>
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <div className="font-medium tabular-nums">{fmtMoney(p.amount, currency)}</div>
                <div className="text-xs capitalize text-(--color-muted)">
                  {p.method.replace("_", " ")} · {fmtDate(p.paidAt)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </div>
                {/* Where the money came from — without this, the advance
                    carried over from a quotation is indistinguishable from a
                    hand-entered cash payment, and it is the row most likely to
                    be reversed by mistake. */}
                {p.note && (
                  <div className="mt-0.5 text-xs normal-case text-(--color-muted)">{p.note}</div>
                )}
              </div>
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
            </div>
            {open && (
              <div className="space-y-3 bg-(--color-bg) px-4 py-3">
                <div className="text-sm font-medium">
                  Reverse this payment of {fmtMoney(p.amount, currency)}?
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
                  The amount comes off this invoice, which goes back to being due. Stock and the
                  invoice itself aren&rsquo;t touched.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
