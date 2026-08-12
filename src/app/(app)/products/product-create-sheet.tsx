"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { createProductQuick, createCategoryAction } from "./actions";

type Unit = { id: string; name: string; symbol: string; groupName: string };
type Category = { id: string; name: string };
type Vendor = { id: string; name: string };

const empty = {
  name: "",
  code: "",
  categoryId: "",
  stockUnitId: "",
  reorderLevel: "",
  costPrice: "",
  preferredVendorId: "",
  notes: "",
};

export function ProductCreateSheet({
  units,
  categories,
  vendors,
}: {
  units: Unit[];
  categories: Category[];
  vendors: Vendor[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ ...empty });

  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catBusy, setCatBusy] = useState(false);

  const unitGroups = useMemo(() => {
    return units.reduce<Record<string, Unit[]>>((acc, u) => {
      (acc[u.groupName] ??= []).push(u);
      return acc;
    }, {});
  }, [units]);

  function openCreate() {
    setF({ ...empty });
    setAddingCat(false);
    setError(null);
    setOpen(true);
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    setCatBusy(true);
    const res = await createCategoryAction(newCat.trim());
    setCatBusy(false);
    if (res.ok) {
      setNewCat("");
      setAddingCat(false);
      router.refresh();
    } else {
      setError(res.error ?? "Could not add category");
    }
  }

  function save() {
    setError(null);
    if (!f.stockUnitId) {
      setError("Choose a unit.");
      return;
    }
    start(async () => {
      const res = await createProductQuick({
        name: f.name,
        code: f.code || null,
        categoryId: f.categoryId || null,
        stockUnitId: f.stockUnitId,
        reorderLevel: f.reorderLevel ? Number(f.reorderLevel) : 0,
        costPrice: f.costPrice ? Number(f.costPrice) : null,
        preferredVendorId: f.preferredVendorId || null,
        notes: f.notes || null,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button className="btn-primary" onClick={openCreate}>
        <Plus className="h-4 w-4" /> Add product
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Add product">
        <div className="space-y-3">
          <div>
            <label className="label">Product name *</label>
            <input
              className="input"
              placeholder="e.g. Onion"
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code / SKU</label>
              <input
                className="input"
                placeholder="Optional"
                value={f.code}
                onChange={(e) => setF({ ...f, code: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Stock unit *</label>
              <select
                className="input"
                value={f.stockUnitId}
                onChange={(e) => setF({ ...f, stockUnitId: e.target.value })}
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
            </div>
          </div>

          <div>
            <label className="label">Category</label>
            <div className="flex gap-2">
              <select
                className="input"
                value={f.categoryId}
                onChange={(e) => setF({ ...f, categoryId: e.target.value })}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-outline shrink-0"
                onClick={() => setAddingCat((v) => !v)}
                title="Add category"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {addingCat && (
              <div className="mt-2 flex gap-2">
                <input
                  className="input"
                  placeholder="New category name"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-primary shrink-0"
                  onClick={addCategory}
                  disabled={catBusy}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reorder level</label>
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={f.reorderLevel}
                onChange={(e) => setF({ ...f, reorderLevel: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Cost price (per unit)</label>
              <input
                className="input"
                type="number"
                step="any"
                min="0"
                placeholder="Optional"
                value={f.costPrice}
                onChange={(e) => setF({ ...f, costPrice: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="label">Preferred vendor</label>
            <select
              className="input"
              value={f.preferredVendorId}
              onChange={(e) => setF({ ...f, preferredVendorId: e.target.value })}
            >
              <option value="">— None —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-(--color-muted)">
              Just a default — pre-fills the vendor when you restock this product.
            </p>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={f.notes}
              onChange={(e) => setF({ ...f, notes: e.target.value })}
            />
          </div>

          {error && <p className="text-sm text-(--color-danger)">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              className="btn-primary flex-1"
              onClick={save}
              disabled={pending || !f.name.trim() || !f.stockUnitId}
            >
              {pending ? "Creating…" : "Add product"}
            </button>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
