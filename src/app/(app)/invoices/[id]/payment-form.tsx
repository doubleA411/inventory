"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
}: {
  invoiceId: string;
  due: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(due > 0 ? String(due) : "");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("cash");
  const [reference, setReference] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await recordPayment({
        invoiceId,
        amount: Number(amount),
        method,
        reference: reference || null,
        paidAt,
        note: null,
      });
      if (res.ok) {
        setReference("");
        router.refresh();
      } else {
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
            onChange={(e) => setAmount(e.target.value)}
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
      <button className="btn-primary w-full" onClick={submit} disabled={pending}>
        {pending ? "Recording…" : "Record payment"}
      </button>
    </div>
  );
}
