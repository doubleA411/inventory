"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { saveExpenseAction, saveExpenseCategoryAction } from "./actions";

type CategoryLite = { id: string; name: string };
type QuotationLite = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string;
};

export type ExpenseFormInitial = {
  id?: string;
  categoryId?: string | null;
  quotationId?: string | null;
  expenseDate?: string;
  description?: string;
  headcount?: string | null;
  rate?: string | null;
  amount?: string;
  notes?: string | null;
};

const today = () => new Date().toISOString().slice(0, 10);

export function ExpenseForm({
  categories,
  quotations,
  initial,
  onSaved,
  onCancel,
}: {
  categories: CategoryLite[];
  quotations: QuotationLite[];
  initial?: ExpenseFormInitial;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [catList, setCatList] = useState(categories);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState("");

  const [quotationId, setQuotationId] = useState(initial?.quotationId ?? "");
  const [expenseDate, setExpenseDate] = useState(initial?.expenseDate ?? today());
  const [description, setDescription] = useState(initial?.description ?? "");
  const [headcount, setHeadcount] = useState(initial?.headcount ?? "");
  const [rate, setRate] = useState(initial?.rate ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  function updateHeadcountRate(nextHeadcount: string, nextRate: string) {
    setHeadcount(nextHeadcount);
    setRate(nextRate);
    const h = Number(nextHeadcount);
    const r = Number(nextRate);
    if (nextHeadcount && nextRate && !Number.isNaN(h) && !Number.isNaN(r)) {
      setAmount(String(Math.round(h * r * 100) / 100));
    }
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    const res = await saveExpenseCategoryAction(newCat);
    if (res.ok) {
      const added = { id: res.id, name: res.name };
      setCatList((l) => [...l, added].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(res.id);
      setShowNewCat(false);
      setNewCat("");
    } else {
      setError(res.error);
    }
  }

  function onSave() {
    setError(null);
    if (!description.trim()) {
      setError("Enter a description.");
      return;
    }
    if (!amount || Number(amount) < 0) {
      setError("Enter a valid amount.");
      return;
    }
    startTransition(async () => {
      const res = await saveExpenseAction({
        id: initial?.id,
        categoryId: categoryId || null,
        quotationId: quotationId || null,
        expenseDate,
        description,
        headcount: headcount ? Number(headcount) : null,
        rate: rate ? Number(rate) : null,
        amount: Number(amount),
        notes: notes || null,
      });
      if (res.ok) {
        onSaved();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Date</label>
        <input
          type="date"
          className="input"
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Category</label>
        <div className="flex gap-2">
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">— None —</option>
            {catList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-outline shrink-0"
            onClick={() => setShowNewCat((v) => !v)}
            title="New category"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showNewCat && (
        <div className="flex gap-2 rounded-lg border border-(--color-border) bg-(--color-bg) p-3">
          <input
            className="input"
            placeholder="e.g. Chinese master, Serving boys, Rental"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button type="button" className="btn-primary shrink-0" onClick={addCategory}>
            Add
          </button>
        </div>
      )}

      <div>
        <label className="label">Description</label>
        <input
          className="input"
          placeholder="e.g. Chinese master — Ravi"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Event (optional)</label>
        <select
          className="input"
          value={quotationId}
          onChange={(e) => setQuotationId(e.target.value)}
        >
          <option value="">— Not tied to an event —</option>
          {quotations.map((q) => (
            <option key={q.id} value={q.id}>
              {q.customerName ?? "Walk-in"} — {fmtDate(q.eventDate)} ({q.number})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 grid-cols-3">
        <div>
          <label className="label">Headcount</label>
          <input
            className="input"
            type="number"
            step="any"
            placeholder="optional"
            value={headcount}
            onChange={(e) => updateHeadcountRate(e.target.value, rate)}
          />
        </div>
        <div>
          <label className="label">Rate</label>
          <input
            className="input"
            type="number"
            step="any"
            placeholder="optional"
            value={rate}
            onChange={(e) => updateHeadcountRate(headcount, e.target.value)}
          />
        </div>
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
      </div>

      <div>
        <label className="label">Notes</label>
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : initial?.id ? "Save changes" : "Add expense"}
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
