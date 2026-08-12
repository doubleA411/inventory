"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Combobox } from "@/components/combobox";
import { createPurchaseList, updatePurchaseList } from "./actions";

type VendorLite = { id: string; name: string };
type ProductLite = { id: string; name: string; stockUnitId: string };
type UnitLite = { id: string; symbol: string; groupId: string };

type Row = {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitId: string;
};

let keySeq = 0;
function newRow(seed?: Partial<Row>): Row {
  return {
    key: `r${keySeq++}`,
    productId: "",
    description: "",
    quantity: "1",
    unitId: "",
    ...seed,
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export type PurchaseListInitial = {
  id: string;
  vendorId: string;
  listDate: string;
  notes: string | null;
  items: { productId: string | null; description: string; quantity: number; unit: string | null }[];
};

export function PurchaseListEditor({
  vendors,
  allProducts,
  preferredProducts,
  units,
  defaultVendorId,
  initial,
}: {
  vendors: VendorLite[];
  allProducts: ProductLite[];
  preferredProducts: ProductLite[];
  units: UnitLite[];
  defaultVendorId?: string;
  initial?: PurchaseListInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState(initial?.vendorId ?? defaultVendorId ?? "");
  const [listDate, setListDate] = useState(initial?.listDate ?? today());
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const productsById = useMemo(() => new Map(allProducts.map((p) => [p.id, p])), [allProducts]);
  const productOptions = useMemo(
    () => allProducts.map((p) => ({ value: p.id, label: p.name })),
    [allProducts],
  );

  function symbolFor(unitId: string): string {
    return units.find((u) => u.id === unitId)?.symbol ?? "";
  }
  function unitIdForSymbol(symbol: string | null, productId: string | null): string {
    if (!symbol) return "";
    const p = productId ? productsById.get(productId) : undefined;
    const candidates = p ? unitsForProduct(p.id) : units;
    return candidates.find((u) => u.symbol === symbol)?.id ?? "";
  }

  const [rows, setRows] = useState<Row[]>(() => {
    if (initial) {
      return initial.items.length
        ? initial.items.map((i) =>
            newRow({
              productId: i.productId ?? "",
              description: i.description,
              quantity: String(i.quantity),
              unitId: unitIdForSymbol(i.unit, i.productId),
            }),
          )
        : [newRow()];
    }
    return preferredProducts.length
      ? preferredProducts.map((p) =>
          newRow({
            productId: p.id,
            description: p.name,
            quantity: "1",
            unitId: p.stockUnitId,
          }),
        )
      : [newRow()];
  });

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function pickProduct(key: string, productId: string) {
    const p = productsById.get(productId);
    updateRow(key, {
      productId,
      description: p?.name ?? "",
      unitId: p?.stockUnitId ?? "",
    });
  }

  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  function unitsForProduct(productId: string): UnitLite[] {
    const p = productsById.get(productId);
    if (!p) return units;
    const stockUnit = units.find((u) => u.id === p.stockUnitId);
    if (!stockUnit) return units;
    return units.filter((u) => u.groupId === stockUnit.groupId);
  }

  function onSave() {
    setError(null);
    if (!vendorId) {
      setError("Select a vendor.");
      return;
    }
    const items = rows
      .filter((r) => r.description.trim())
      .map((r) => ({
        productId: r.productId || null,
        description: r.description,
        quantity: Number(r.quantity) || 0,
        unit: symbolFor(r.unitId) || null,
      }));

    if (items.length === 0) {
      setError("Add at least one item.");
      return;
    }

    startTransition(async () => {
      const res = initial
        ? await updatePurchaseList(initial.id, { vendorId, listDate, notes: notes || null, items })
        : await createPurchaseList({ vendorId, listDate, notes: notes || null, items });
      if (res.ok) {
        router.push(`/purchase-lists/${res.id}`);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Vendor</label>
            <select
              className="input"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              disabled={!!initial}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">List date</label>
            <input
              type="date"
              className="input"
              value={listDate}
              onChange={(e) => setListDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="w-28 pb-2 pr-3 text-right font-medium">Qty</th>
                <th className="w-28 pb-2 pr-3 font-medium">Unit</th>
                <th className="w-9 pb-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 pr-3">
                    <Combobox
                      options={productOptions}
                      value={r.description}
                      placeholder="Item name"
                      searchPlaceholder="Search products…"
                      emptyText="No products found."
                      onChange={(value, option) => {
                        if (option) pickProduct(r.key, option.value);
                        else updateRow(r.key, { description: value, productId: "" });
                      }}
                    />
                  </td>
                  <td className="w-28 py-2 pr-3">
                    <input
                      className="input w-full text-right tabular-nums"
                      type="number"
                      step="any"
                      min="0"
                      value={r.quantity}
                      onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="w-28 py-2 pr-3">
                    <select
                      className="input w-full"
                      value={r.unitId}
                      onChange={(e) => updateRow(r.key, { unitId: e.target.value })}
                    >
                      <option value="">—</option>
                      {unitsForProduct(r.productId).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.symbol}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="w-9 py-2 text-right">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => removeRow(r.key)}
                      title="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-outline mt-3" onClick={addRow}>
          <Plus className="h-4 w-4" /> Add item
        </button>

        <div className="mt-4">
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Save purchase list"}
        </button>
      </div>
    </div>
  );
}
