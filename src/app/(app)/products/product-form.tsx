"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createCategoryAction, type ActionState } from "./actions";

type Unit = { id: string; name: string; symbol: string; groupName: string };
type Category = { id: string; name: string };
type Vendor = { id: string; name: string };

export function ProductForm({
  action,
  units,
  categories,
  vendors = [],
  defaults,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  units: Unit[];
  categories: Category[];
  vendors?: Vendor[];
  defaults?: {
    name?: string;
    code?: string | null;
    categoryId?: string | null;
    stockUnitId?: string;
    reorderLevel?: string;
    costPrice?: string | null;
    preferredVendorId?: string | null;
    notes?: string | null;
  };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    {},
  );
  const router = useRouter();
  const [addingCat, setAddingCat] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [catError, setCatError] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState(defaults?.preferredVendorId ?? "");
  const [stockUnitId, setStockUnitId] = useState(defaults?.stockUnitId ?? "");

  async function addCategory() {
    if (!newCat.trim()) return;
    setCatBusy(true);
    const res = await createCategoryAction(newCat);
    setCatBusy(false);
    if (res.ok) {
      setNewCat("");
      setAddingCat(false);
      router.refresh();
    } else {
      setCatError(res.error ?? "Could not add that category.");
    }
  }

  // Group units by group for a nicer <optgroup> select.
  const grouped = units.reduce<Record<string, Unit[]>>((acc, u) => {
    (acc[u.groupName] ??= []).push(u);
    return acc;
  }, {});
  const originalStockUnit = units.find((unit) => unit.id === defaults?.stockUnitId);
  const selectedStockUnit = units.find((unit) => unit.id === stockUnitId);
  const changingStockUnit = !!originalStockUnit && stockUnitId !== originalStockUnit.id;
  const canConvertStockUnit =
    !changingStockUnit || originalStockUnit?.groupName === selectedStockUnit?.groupName;

  function confirmUnitConversion(event: React.FormEvent<HTMLFormElement>) {
    if (!changingStockUnit) return;
    if (!canConvertStockUnit) {
      event.preventDefault();
      return;
    }
    const confirmed = window.confirm(
      `Convert this product from ${originalStockUnit?.symbol} to ${selectedStockUnit?.symbol}? ` +
        "Stock, reorder level, batch quantities, and per-unit costs will be converted.",
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={formAction} onSubmit={confirmUnitConversion} className="card max-w-2xl space-y-5 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Product name *
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={defaults?.name ?? ""}
            className="input"
            placeholder="e.g. Onion"
          />
        </div>

        <div>
          <label className="label" htmlFor="code">
            Code / SKU
          </label>
          <input
            id="code"
            name="code"
            defaultValue={defaults?.code ?? ""}
            className="input"
            placeholder="Optional"
          />
        </div>

        <div>
          <label className="label" htmlFor="stockUnitId">
            Stock unit *
          </label>
          <select
            id="stockUnitId"
            name="stockUnitId"
            required
            value={stockUnitId}
            onChange={(event) => setStockUnitId(event.target.value)}
            className="input"
          >
            <option value="" disabled>
              Choose a unit…
            </option>
            {Object.entries(grouped).map(([group, us]) => (
              <optgroup key={group} label={group}>
                {us.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.symbol})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {changingStockUnit && !canConvertStockUnit && (
            <p className="mt-1 text-xs text-(--color-danger)">
              {originalStockUnit?.name} and {selectedStockUnit?.name} are different unit types and
              cannot be converted automatically. Choose a unit from the {originalStockUnit?.groupName} group.
            </p>
          )}
          {changingStockUnit && canConvertStockUnit && (
            <p className="mt-1 text-xs text-(--color-muted)">
              Saving will convert existing stock, reorder level, batch quantities, and per-unit costs.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="categoryId">
            Category
          </label>
          <div className="flex gap-2">
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={defaults?.categoryId ?? ""}
              className="input"
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
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                className="input"
                placeholder="New category name"
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
          {catError && (
            <p className="mt-2 text-sm text-(--color-danger)">{catError}</p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="reorderLevel">
            Reorder level
          </label>
          <input
            id="reorderLevel"
            name="reorderLevel"
            type="number"
            step="any"
            min="0"
            defaultValue={defaults?.reorderLevel ?? "0"}
            className="input"
          />
        </div>

        <div>
          <label className="label" htmlFor="costPrice">
            Cost price (per unit)
          </label>
          <input
            id="costPrice"
            name="costPrice"
            type="number"
            step="any"
            min="0"
            defaultValue={defaults?.costPrice ?? ""}
            className="input"
            placeholder="Optional"
          />
          <p className="mt-1 text-xs text-(--color-muted)">
            Required below if you log a purchase from a vendor.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="preferredVendorId">
            Preferred vendor
          </label>
          <select
            id="preferredVendorId"
            name="preferredVendorId"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            className="input"
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
            You can still buy it from anyone else.
          </p>
        </div>

        {vendorId && (
          <div className="sm:col-span-2 rounded-lg border border-(--color-border) p-4">
            <p className="mb-3 text-sm font-medium">Log a purchase from this vendor</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="restockQty">
                  Quantity received
                </label>
                <input
                  id="restockQty"
                  name="restockQty"
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="label" htmlFor="restockPaidNow">
                  Paid now
                </label>
                <input
                  id="restockPaidNow"
                  name="restockPaidNow"
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  placeholder="0.00"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-(--color-muted)">
              Leave quantity blank if you&apos;re just setting a default vendor.
              Fill it in to restock and log this as a purchase bill, using the
              cost price above as the rate.
            </p>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={defaults?.notes ?? ""}
            className="input"
            placeholder="Optional"
          />
        </div>
      </div>

      {state.error && (
        <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/products" className="btn-ghost">
          Cancel
        </Link>
      </div>
    </form>
  );
}
