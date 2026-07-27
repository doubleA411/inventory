"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Lock } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import type { LedgerDay, LedgerRow } from "@/lib/expenses";
import { ExpenseSheet } from "./expense-sheet";
import { ExpenseRowActions } from "./expense-row-actions";
import type { ExpenseFormInitial } from "./expense-form";

type CategoryLite = { id: string; name: string };
type QuotationLite = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string;
};

type SheetState = { mode: "add" } | { mode: "edit"; initial: ExpenseFormInitial } | null;

function rowToInitial(row: LedgerRow): ExpenseFormInitial {
  return {
    id: row.id,
    categoryId: row.categoryId ?? null,
    quotationId: row.quotationId,
    expenseDate: row.date,
    description: row.description,
    headcount: row.headcount ?? null,
    rate: row.rate ?? null,
    amount: String(row.amount),
    notes: row.notes ?? null,
  };
}

export function ExpensesBoard({
  categories,
  quotations,
  days,
  total,
  cur,
}: {
  categories: CategoryLite[];
  quotations: QuotationLite[];
  days: LedgerDay[];
  total: number;
  cur: string;
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);

  function close() {
    setSheet(null);
  }
  function onSaved() {
    setSheet(null);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={() => setSheet({ mode: "add" })}>
          <Plus className="h-4 w-4" /> Add expense
        </button>
      </div>

      {days.length === 0 ? (
        <EmptyState
          title="No expenses in this range"
          description="Log labor, rentals or other costs, or widen the date range to see stock usage here too."
          action={
            <button className="btn-primary" onClick={() => setSheet({ mode: "add" })}>
              Add expense
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          {days.map((day) => (
            <div key={day.date}>
              <div className="border-b border-t border-(--color-border) bg-(--color-bg) px-4 py-2 text-sm font-medium first:border-t-0">
                {fmtDate(day.date)}
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-(--color-border)">
                  {day.items.map((row) => (
                    <tr key={`${row.source}-${row.id}`}>
                      <td className="w-40 px-4 py-2.5">
                        <span
                          className={
                            row.source === "stock"
                              ? "inline-flex items-center gap-1 rounded-md bg-(--color-bg) px-2 py-0.5 text-xs text-(--color-muted)"
                              : "inline-flex items-center gap-1 rounded-md bg-(--color-primary-soft) px-2 py-0.5 text-xs text-(--color-primary)"
                          }
                        >
                          {row.source === "stock" && <Lock className="h-3 w-3" />}
                          {row.category}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.description}
                        {row.quotationNumber && (
                          <span className="ml-2 text-xs text-(--color-muted)">
                            {row.customerName ?? "Walk-in"} · {row.quotationNumber}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {fmtMoney(row.amount, cur)}
                      </td>
                      <td className="w-20 px-4 py-2.5 text-right">
                        {row.source === "stock" ? (
                          row.productId ? (
                            <Link
                              href={`/products/${row.productId}`}
                              className="text-xs text-(--color-primary) hover:underline"
                            >
                              View
                            </Link>
                          ) : null
                        ) : (
                          <ExpenseRowActions
                            id={row.id}
                            onEdit={() => setSheet({ mode: "edit", initial: rowToInitial(row) })}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-6 bg-(--color-bg) px-4 py-2 text-xs text-(--color-muted)">
                Subtotal
                <span className="font-medium text-(--color-fg)">{fmtMoney(day.total, cur)}</span>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-6 border-t border-(--color-border) px-4 py-3 text-sm font-semibold">
            Total
            <span className="tabular-nums">{fmtMoney(total, cur)}</span>
          </div>
        </div>
      )}

      {sheet && (
        <ExpenseSheet
          title={sheet.mode === "edit" ? "Edit expense" : "Add expense"}
          categories={categories}
          quotations={quotations}
          initial={sheet.mode === "edit" ? sheet.initial : undefined}
          onClose={close}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
