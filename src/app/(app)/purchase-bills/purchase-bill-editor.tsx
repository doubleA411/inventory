"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { fmtMoney } from "@/lib/utils";
import { createPurchaseBill } from "./actions";

type VendorLite = { id: string; name: string };
type ProductLite = { id: string; name: string; stockUnitId: string; costPrice: string | null };
type UnitLite = { id: string; symbol: string; groupId: string };

type Row = {
  key: string;
  kind: "product" | "charge";
  productId: string;
  description: string;
  quantity: string;
  unitId: string;
  rate: string;
  amount: string; // charge lines only
};

let keySeq = 0;
function newRow(): Row {
  return {
    key: `r${keySeq++}`,
    kind: "product",
    productId: "",
    description: "",
    quantity: "1",
    unitId: "",
    rate: "",
    amount: "",
  };
}

const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseBillEditor({
  vendors,
  products,
  units,
  currency,
  defaultVendorId,
}: {
  vendors: VendorLite[];
  products: ProductLite[];
  units: UnitLite[];
  currency: string;
  defaultVendorId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState(defaultVendorId ?? "");
  const [billDate, setBillDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);

  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function pickProduct(key: string, productId: string) {
    const p = productsById.get(productId);
    updateRow(key, {
      productId,
      description: p?.name ?? "",
      unitId: p?.stockUnitId ?? "",
      rate: p?.costPrice != null ? String(p.costPrice) : "",
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

  function lineAmount(r: Row): number {
    if (r.kind === "charge") return Number(r.amount) || 0;
    return (Number(r.quantity) || 0) * (Number(r.rate) || 0);
  }
  const total = rows.reduce((s, r) => s + lineAmount(r), 0);

  function onSave() {
    setError(null);
    const items = rows
      .filter((r) => r.description.trim())
      .map((r) =>
        r.kind === "product"
          ? {
              kind: "product" as const,
              productId: r.productId,
              description: r.description,
              quantity: Number(r.quantity) || 0,
              unitId: r.unitId,
              unit: units.find((u) => u.id === r.unitId)?.symbol ?? "",
              rate: Number(r.rate) || 0,
            }
          : {
              kind: "charge" as const,
              description: r.description,
              amount: Number(r.amount) || 0,
            },
      );

    if (items.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (items.some((i) => i.kind === "product" && (!i.productId || !i.unitId))) {
      setError("Every product line needs a product and a unit.");
      return;
    }

    startTransition(async () => {
      const res = await createPurchaseBill({
        vendorId: vendorId || null,
        billDate,
        notes: notes || null,
        items,
      });
      if (res.ok) {
        router.push(`/purchase-bills/${res.id}`);
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
            <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Bill date</label>
            <input
              type="date"
              className="input"
              value={billDate}
              onChange={(e) => setBillDate(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="py-2 pr-2 font-medium">Line</th>
                <th className="py-2 pr-2 font-medium">Description</th>
                <th className="py-2 pr-2 text-right font-medium">Qty</th>
                <th className="py-2 pr-2 font-medium">Unit</th>
                <th className="py-2 pr-2 text-right font-medium">Rate</th>
                <th className="py-2 pr-2 text-right font-medium">Amount</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {rows.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-2 pr-2">
                    <select
                      className="input"
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as Row["kind"];
                        updateRow(r.key, kind === "charge"
                          ? { kind, productId: "", unitId: "", rate: "" }
                          : { kind });
                      }}
                    >
                      <option value="product">Product</option>
                      <option value="charge">Charge</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    {r.kind === "product" ? (
                      <select
                        className="input"
                        value={r.productId}
                        onChange={(e) => pickProduct(r.key, e.target.value)}
                      >
                        <option value="">— Select product —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        placeholder="e.g. Delivery charge"
                        value={r.description}
                        onChange={(e) => updateRow(r.key, { description: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {r.kind === "product" && (
                      <input
                        className="input w-24 text-right"
                        type="number"
                        step="any"
                        min="0"
                        value={r.quantity}
                        onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {r.kind === "product" && (
                      <select
                        className="input w-24"
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
                    )}
                  </td>
                  <td className="py-2 pr-2">
                    {r.kind === "product" ? (
                      <input
                        className="input w-24 text-right"
                        type="number"
                        step="any"
                        min="0"
                        value={r.rate}
                        onChange={(e) => updateRow(r.key, { rate: e.target.value })}
                      />
                    ) : (
                      <input
                        className="input w-24 text-right"
                        type="number"
                        step="any"
                        min="0"
                        value={r.amount}
                        onChange={(e) => updateRow(r.key, { amount: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {fmtMoney(lineAmount(r), currency)}
                  </td>
                  <td className="py-2 text-right">
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
          <Plus className="h-4 w-4" /> Add line
        </button>

        <div className="mt-4">
          <label className="label">Notes</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="mt-4 flex justify-end border-t border-(--color-border) pt-4">
          <div className="text-right">
            <div className="text-xs text-(--color-muted)">Total</div>
            <div className="text-lg font-semibold tabular-nums">{fmtMoney(total, currency)}</div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save purchase bill"}
        </button>
      </div>
    </div>
  );
}
