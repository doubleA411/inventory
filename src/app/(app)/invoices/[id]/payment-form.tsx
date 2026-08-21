"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/utils";
import { recordPayment } from "../actions";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

export function PaymentForm({
  invoiceId,
  due,
  currency,
}: {
  invoiceId: string;
  due: number;
  currency: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(due > 0 ? String(due) : "");
  // `due` changes after each recorded payment (via router.refresh()) — reset
  // the input to the new balance rather than leaving the last-typed amount.
  // Adjusting state during render (not an effect) per React's guidance for
  // "state that depends on a changed prop".
  const [prevDue, setPrevDue] = useState(due);
  if (due !== prevDue) {
    setPrevDue(due);
    setAmount(due > 0 ? String(due) : "");
  }
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  // Set when the server refuses an amount above the balance due. Paying more
  // than is owed is legitimate now and then (a customer rounding up), so this
  // asks instead of blocking — but it never happens silently.
  const [confirmOver, setConfirmOver] = useState<number | null>(null);

  function submit(allowOverpayment = false) {
    setError(null);
    startTransition(async () => {
      const res = await recordPayment(
        {
          invoiceId,
          amount: Number(amount),
          method,
          reference: reference || null,
          paidAt,
          note: null,
        },
        allowOverpayment,
      );
      if (res.ok) {
        setReference("");
        setConfirmOver(null);
        router.refresh();
      } else {
        if (res.overpayment) setConfirmOver(res.overpayment.amount);
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount</label>
          <input
            className="input"
            type="number"
            step="any"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
              setConfirmOver(null);
            }}
          />
        </div>
        <div>
          <label className="label">Method</label>
          <select
            className="input"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Date</label>
          <input
            className="input"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Reference</label>
          <input
            className="input"
            placeholder="Txn / cheque no."
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-(--color-danger)">{error}</p>}
      {confirmOver != null ? (
        <div className="space-y-2 rounded-md bg-(--color-bg) p-3">
          <p className="text-sm font-medium">
            Record {fmtMoney(confirmOver, currency)} anyway?
          </p>
          <p className="text-xs text-(--color-muted)">
            {due > 0
              ? `Only ${fmtMoney(due, currency)} is due, so this bill will end up overpaid.`
              : "This bill is already fully paid, so this will make it overpaid."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-outline text-sm"
              disabled={pending}
              onClick={() => submit(true)}
            >
              {pending ? "Recording…" : "Yes, record it"}
            </button>
            <button
              className="btn-ghost text-sm"
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
      ) : (
        <button className="btn-primary w-full" onClick={() => submit()} disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </button>
      )}
    </div>
  );
}
