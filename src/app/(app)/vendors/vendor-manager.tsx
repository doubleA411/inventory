"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { saveVendor, deleteVendor, quickCreateProduct } from "./actions";
import { fmtMoney } from "@/lib/utils";
import { Sheet } from "@/components/sheet";

type VendorRow = {
  id: string;
  name: string;
  phone: string | null;
  district: string;
  location: string | null;
  openingBalance: string;
  purchased: string;
  paid: string;
};

type ProductOption = { id: string; name: string };
type UnitOption = { id: string; name: string; symbol: string; groupName: string };

const empty = { name: "", phone: "", location: "", openingBalance: "" };

export function VendorManager({
  vendors,
  products,
  units,
  currency,
}: {
  vendors: VendorRow[];
  products: ProductOption[];
  units: UnitOption[];
  currency: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...empty });
  const [productList, setProductList] = useState(products);
  const [productQuery, setProductQuery] = useState("");
  const [productIds, setProductIds] = useState<Set<string>>(new Set());

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [qa, setQa] = useState({ name: "", unitId: "" });
  const [qaBusy, setQaBusy] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);

  const unitGroups = useMemo(() => {
    return units.reduce<Record<string, UnitOption[]>>((acc, u) => {
      (acc[u.groupName] ??= []).push(u);
      return acc;
    }, {});
  }, [units]);

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const list = q ? productList.filter((p) => p.name.toLowerCase().includes(q)) : productList;
    return list.slice(0, 30);
  }, [productList, productQuery]);

  function toggleProduct(id: string) {
    setProductIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openQuickAdd() {
    setQa({ name: productQuery.trim(), unitId: "" });
    setQaError(null);
    setShowQuickAdd(true);
  }

  async function createQuickProduct() {
    if (!qa.name.trim() || !qa.unitId) {
      setQaError("Name and unit are required.");
      return;
    }
    setQaBusy(true);
    setQaError(null);
    const res = await quickCreateProduct(qa.name.trim(), qa.unitId);
    setQaBusy(false);
    if (res.ok) {
      setProductList((l) => [...l, { id: res.id, name: res.name }].sort((a, b) => a.name.localeCompare(b.name)));
      setProductIds((s) => new Set(s).add(res.id));
      setShowQuickAdd(false);
      setProductQuery("");
    } else {
      setQaError(res.error);
    }
  }

  function openCreate() {
    setF({ ...empty });
    setProductIds(new Set());
    setProductQuery("");
    setShowQuickAdd(false);
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveVendor({
        name: f.name,
        phone: f.phone || null,
        location: f.location || null,
        openingBalance: f.openingBalance ? Number(f.openingBalance) : 0,
        productIds: [...productIds],
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error ?? "Could not save");
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this vendor?")) return;
    start(async () => {
      await deleteVendor(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add vendor
        </button>
      </div>

      {vendors.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
          No vendors yet. Add one, or pick one while recording a purchase.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 text-right font-medium">Purchased</th>
                <th className="px-4 py-3 text-right font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {vendors.map((v) => {
                const due = Number(v.purchased) - Number(v.paid) + Number(v.openingBalance);
                return (
                  <tr key={v.id} className="hover:bg-(--color-bg)">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/vendors/${v.id}`} className="hover:underline">
                        {v.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-(--color-muted)">
                      {[v.location, v.district].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtMoney(v.purchased, currency)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {due > 0 ? (
                        <span className="text-(--color-danger)">{fmtMoney(due, currency)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-(--color-muted)">{v.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn-ghost" onClick={() => remove(v.id)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Add vendor">
        <div className="space-y-3">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Phone</label>
              <input
                className="input"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                value={f.location}
                onChange={(e) => setF({ ...f, location: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label">Opening balance</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={f.openingBalance}
              onChange={(e) => setF({ ...f, openingBalance: e.target.value })}
            />
            <p className="mt-1 text-xs text-(--color-muted)">
              Amount already owed to this vendor before adding them here.
            </p>
          </div>

          <div>
            <label className="label mb-1 block">Products supplied</label>
            {productIds.size > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {productList
                  .filter((p) => productIds.has(p.id))
                  .map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 rounded-full bg-(--color-primary-soft) px-2 py-0.5 text-xs"
                    >
                      {p.name}
                      <button
                        type="button"
                        onClick={() => toggleProduct(p.id)}
                        className="text-(--color-muted) hover:text-(--color-fg)"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
              <input
                className="input pl-9"
                placeholder="Search products…"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
              />
            </div>
            <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-(--color-border)">
              {filteredProducts.length === 0 ? (
                <div className="px-3 py-2 text-xs text-(--color-muted)">No products match.</div>
              ) : (
                filteredProducts.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-(--color-bg)"
                  >
                    <input
                      type="checkbox"
                      checked={productIds.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                  </label>
                ))
              )}
            </div>

            {!showQuickAdd ? (
              <button
                type="button"
                className="mt-1.5 text-xs font-medium text-(--color-primary) hover:underline"
                onClick={openQuickAdd}
              >
                <UserPlus className="mr-1 inline h-3.5 w-3.5" />
                {productQuery.trim()
                  ? `Create "${productQuery.trim()}" as a new product`
                  : "Create a new product"}
              </button>
            ) : (
              <div className="mt-2 space-y-2 rounded-lg border border-(--color-border) bg-(--color-bg) p-3">
                <input
                  className="input"
                  placeholder="Product name"
                  value={qa.name}
                  onChange={(e) => setQa({ ...qa, name: e.target.value })}
                />
                <select
                  className="input"
                  value={qa.unitId}
                  onChange={(e) => setQa({ ...qa, unitId: e.target.value })}
                >
                  <option value="" disabled>
                    Choose a unit…
                  </option>
                  {Object.entries(unitGroups).map(([group, us]) => (
                    <optgroup key={group} label={group}>
                      {us.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.symbol})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {qaError && <p className="text-xs text-(--color-danger)">{qaError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={createQuickProduct}
                    disabled={qaBusy}
                  >
                    {qaBusy ? "Creating…" : "Create product"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowQuickAdd(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <p className="mt-1.5 text-xs text-(--color-muted)">
              Sets this vendor as the preferred vendor for each product picked.
            </p>
          </div>

          {error && <p className="text-sm text-(--color-danger)">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex-1"
              onClick={save}
              disabled={pending || !f.name.trim()}
            >
              {pending ? "Saving…" : "Add vendor"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
