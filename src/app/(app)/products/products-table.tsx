"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { CostTrendBadge } from "@/components/cost-trend";
import { ClickableRow, stopRowClick } from "@/components/clickable-row";
import { fmtQty } from "@/lib/utils";
import {
  bulkDeleteProductsAction,
  bulkSetCategoryAction,
  bulkSetActiveAction,
} from "./actions";
import type { ProductRow } from "@/lib/queries";

export function ProductsTable({
  products,
  categories,
  currency,
  canEdit,
}: {
  products: ProductRow[];
  categories: { id: string; name: string }[];
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryChoice, setCategoryChoice] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = products.length > 0 && selected.size === products.length;
  const someSelected = selected.size > 0 && !allSelected;

  const selectedProducts = products.filter((p) => selected.has(p.id));
  const allSelectedActive =
    selectedProducts.length > 0 && selectedProducts.every((p) => p.isActive);
  const allSelectedInactive =
    selectedProducts.length > 0 && selectedProducts.every((p) => !p.isActive);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
    setConfirmingDelete(false);
    setCategoryChoice("");
    setError(null);
  }

  function applyBulkDelete() {
    setError(null);
    start(async () => {
      const res = await bulkDeleteProductsAction(Array.from(selected));
      if (res.ok) {
        clear();
        router.refresh();
      } else setError(res.error ?? "Could not delete products");
    });
  }

  function applyBulkCategory() {
    setError(null);
    start(async () => {
      const res = await bulkSetCategoryAction(
        Array.from(selected),
        categoryChoice || null,
      );
      if (res.ok) {
        clear();
        router.refresh();
      } else setError(res.error ?? "Could not update category");
    });
  }

  function applyBulkActive(isActive: boolean) {
    setError(null);
    start(async () => {
      const res = await bulkSetActiveAction(Array.from(selected), isActive);
      if (res.ok) {
        clear();
        router.refresh();
      } else setError(res.error ?? "Could not update products");
    });
  }

  return (
    <div className="card overflow-hidden">
      {canEdit && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-(--color-border) bg-(--color-bg) px-4 py-3 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <button className="btn-ghost" onClick={clear} disabled={pending}>
            Clear
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="input"
              value={categoryChoice}
              onChange={(e) => setCategoryChoice(e.target.value)}
              disabled={pending}
            >
              <option value="">— No category —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="btn-outline" onClick={applyBulkCategory} disabled={pending}>
              Set category
            </button>
            <button
              className="btn-outline"
              onClick={() => applyBulkActive(true)}
              disabled={pending || allSelectedActive}
              title={allSelectedActive ? "Selected products are already active" : undefined}
            >
              Activate
            </button>
            <button
              className="btn-outline"
              onClick={() => applyBulkActive(false)}
              disabled={pending || allSelectedInactive}
              title={allSelectedInactive ? "Selected products are already inactive" : undefined}
            >
              Deactivate
            </button>
            {confirmingDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-(--color-muted)">Delete?</span>
                <button className="btn-danger" onClick={applyBulkDelete} disabled={pending}>
                  Yes, delete
                </button>
                <button className="btn-ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn-outline" onClick={() => setConfirmingDelete(true)} disabled={pending}>
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="border-b border-(--color-border) px-4 py-2 text-sm text-(--color-danger)">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
              {canEdit && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={toggleAll}
                    aria-label="Select all products"
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 text-right font-medium">In stock</th>
              <th className="px-4 py-3 text-right font-medium">Reorder at</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {products.map((p) => {
              const status =
                p.currentStock <= 0
                  ? { tone: "danger" as const, label: "Out of stock" }
                  : p.currentStock <= p.reorderLevel
                    ? { tone: "warn" as const, label: "Low" }
                    : { tone: "ok" as const, label: "OK" };
              return (
                <ClickableRow
                  key={p.id}
                  href={`/products/${p.id}`}
                  className={`hover:bg-(--color-bg) ${p.isActive ? "" : "opacity-60"}`}
                >
                  {canEdit && (
                    <td className="px-4 py-3" onClick={stopRowClick}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <Link
                      href={`/products/${p.id}`}
                      onClick={stopRowClick}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.code && (
                      <span className="ml-2 font-mono text-xs text-(--color-muted)">
                        {p.code}
                      </span>
                    )}
                    {!p.isActive && (
                      <span className="ml-2">
                        <Badge tone="default">Inactive</Badge>
                      </span>
                    )}
                    <CostTrendBadge
                      trend={p.costTrend}
                      currency={currency}
                      unitSymbol={p.unitSymbol}
                    />
                  </td>
                  <td className="px-4 py-3 text-(--color-muted)">{p.categoryName ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {fmtQty(p.currentStock)}{" "}
                    <span className="text-(--color-muted)">{p.unitSymbol}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-(--color-muted)">
                    {fmtQty(p.reorderLevel)} {p.unitSymbol}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
