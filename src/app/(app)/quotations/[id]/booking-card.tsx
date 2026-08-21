"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, CalendarX } from "lucide-react";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { recordQuotationAdvance, markQuotationTaken, unmarkQuotationTaken } from "../actions";

/**
 * Whether this date is actually held — separate from the quotation's
 * approval/status workflow. A customer can accept a price without
 * committing to the date; this is what the "upcoming events" dashboard
 * widget gates on. See recordQuotationAdvanceCore / markQuotationTakenCore.
 */
export function BookingCard({
  id,
  currency,
  total,
  advanceAmount,
  advanceRecordedAt,
  takenAt,
  converted,
  convertedInvoiceId,
  invoicePaid,
}: {
  id: string;
  currency: string;
  total: string;
  advanceAmount: string | null;
  advanceRecordedAt: Date | null;
  takenAt: Date | null;
  // Once converted, the invoice's own payments are the real record — the
  // advance already landed there as its first payment (see
  // convertToInvoiceCore) — so editing it here would just be a second,
  // out-of-sync copy of the same money.
  converted: boolean;
  convertedInvoiceId: string | null;
  // Live amountPaid from that invoice. Read fresh rather than trusting the
  // quotation's stored advance, which does not hear about a reversal.
  invoicePaid: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOver, setConfirmOver] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [amount, setAmount] = useState(advanceAmount ?? "");

  const taken = !!takenAt || advanceAmount != null;
  const dirty = amount.trim() !== (advanceAmount ?? "");
  const totalNum = Number(total);
  const collected = converted ? Number(invoicePaid ?? 0) : Number(advanceAmount ?? 0);
  const balance = Math.max(0, Math.round((totalNum - collected) * 100) / 100);

  function save(allowOverAdvance = false) {
    setError(null);
    start(async () => {
      const value = amount.trim() === "" ? null : Number(amount);
      const res = await recordQuotationAdvance(id, value, allowOverAdvance);
      if (!res.ok) {
        // An advance above the quotation total is nearly always a stray zero,
        // but not always — so it asks rather than refusing outright.
        if (res.overAdvance) setConfirmOver(res.overAdvance.amount);
        setError(res.error);
        return;
      }
      setConfirmOver(null);
      router.refresh();
    });
  }

  function clear() {
    setError(null);
    start(async () => {
      const res = await recordQuotationAdvance(id, null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAmount("");
      setConfirmClear(false);
      router.refresh();
    });
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Booking</span>
        {taken ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-(--color-ok)">
            <CalendarCheck className="h-3.5 w-3.5" /> Date held
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-(--color-muted)">
            <CalendarX className="h-3.5 w-3.5" /> Not confirmed
          </span>
        )}
      </div>

      {converted ? (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-(--color-muted)">Collected</span>
            <span className="font-medium tabular-nums">{fmtMoney(collected, currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-(--color-muted)">Still to collect</span>
            <span className="font-medium tabular-nums">{fmtMoney(balance, currency)}</span>
          </div>
          <p className="text-xs text-(--color-muted)">
            Converted to an invoice — payments are tracked{" "}
            {convertedInvoiceId ? (
              <Link href={`/invoices/${convertedInvoiceId}`} className="underline">
                on the invoice
              </Link>
            ) : (
              "on the invoice"
            )}
            , and these figures come from there.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="shrink-0 text-(--color-muted)">Advance</span>
              <div className="flex items-center gap-1.5">
                <input
                  className="input h-8 w-28 text-right"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                    setConfirmOver(null);
                  }}
                />
                <button
                  className="btn-primary h-8 px-2"
                  disabled={pending || !dirty}
                  onClick={() => save()}
                >
                  Save
                </button>
              </div>
            </div>

            {advanceAmount != null && (
              <div className="flex items-center justify-between">
                <span className="text-(--color-muted)">Still to collect</span>
                <span className="font-medium tabular-nums">{fmtMoney(balance, currency)}</span>
              </div>
            )}
            {advanceAmount != null && advanceRecordedAt && (
              <div className="text-right text-xs text-(--color-muted)">
                Recorded {fmtDate(advanceRecordedAt.toISOString())}
              </div>
            )}
            {error && <p className="text-sm text-(--color-danger)">{error}</p>}

            {confirmOver != null && (
              <div className="space-y-2 rounded-md bg-(--color-bg) p-3">
                <p className="text-sm">
                  Record {fmtMoney(confirmOver, currency)} anyway? The quotation is only{" "}
                  {fmtMoney(totalNum, currency)}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-outline h-8 px-2 text-sm"
                    disabled={pending}
                    onClick={() => save(true)}
                  >
                    Yes, record it
                  </button>
                  <button
                    className="btn-ghost h-8 px-2 text-sm"
                    disabled={pending}
                    onClick={() => {
                      setConfirmOver(null);
                      setError(null);
                    }}
                  >
                    Let me fix it
                  </button>
                </div>
              </div>
            )}
          </div>

          {advanceAmount != null && (
            <div className="mt-3 border-t border-(--color-border) pt-3">
              {confirmClear ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Remove the {fmtMoney(advanceAmount, currency)} advance?
                  </p>
                  <p className="text-xs text-(--color-muted)">
                    The booking goes back to having no money recorded against it. The date stays
                    held.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="btn-outline h-8 px-2 text-sm text-(--color-danger)"
                      disabled={pending}
                      onClick={clear}
                    >
                      {pending ? "Removing…" : "Remove advance"}
                    </button>
                    <button
                      className="btn-ghost h-8 px-2 text-sm"
                      disabled={pending}
                      onClick={() => setConfirmClear(false)}
                    >
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-ghost text-sm"
                  disabled={pending}
                  onClick={() => setConfirmClear(true)}
                >
                  Remove advance
                </button>
              )}
            </div>
          )}

          {advanceAmount == null && (
            <div className="mt-3 border-t border-(--color-border) pt-3">
              {takenAt ? (
                <button
                  className="btn-ghost text-sm"
                  disabled={pending}
                  onClick={() => start(async () => void (await unmarkQuotationTaken(id)))}
                >
                  Unmark as taken
                </button>
              ) : (
                <button
                  className="btn-outline w-full text-sm"
                  disabled={pending}
                  onClick={() => start(async () => void (await markQuotationTaken(id)))}
                >
                  Mark as taken (no advance yet)
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
