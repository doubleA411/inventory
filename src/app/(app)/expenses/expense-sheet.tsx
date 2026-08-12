"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ExpenseForm, type ExpenseFormInitial } from "./expense-form";

type CategoryLite = { id: string; name: string };
type QuotationLite = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string;
};

export function ExpenseSheet({
  title,
  categories,
  quotations,
  initial,
  onClose,
  onSaved,
}: {
  title: string;
  categories: CategoryLite[];
  quotations: QuotationLite[];
  initial?: ExpenseFormInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  return (
    <div className="fixed inset-0 z-40">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ease-[var(--ease-out)] ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-(--color-surface) shadow-xl transition-transform duration-200 ease-[var(--ease-out)] ${
          visible ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost" onClick={handleClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <ExpenseForm
            categories={categories}
            quotations={quotations}
            initial={initial}
            onSaved={onSaved}
            onCancel={handleClose}
          />
        </div>
      </aside>
    </div>
  );
}
