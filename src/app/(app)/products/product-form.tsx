"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createCategoryAction, type ActionState } from "./actions";

type Unit = { id: string; name: string; symbol: string; groupName: string };
type Category = { id: string; name: string };

export function ProductForm({
  action,
  units,
  categories,
  defaults,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  units: Unit[];
  categories: Category[];
  defaults?: {
    name?: string;
    code?: string | null;
    categoryId?: string | null;
    stockUnitId?: string;
    reorderLevel?: string;
    costPrice?: string | null;
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
      alert(res.error);
    }
  }

  // Group units by group for a nicer <optgroup> select.
  const grouped = units.reduce<Record<string, Unit[]>>((acc, u) => {
    (acc[u.groupName] ??= []).push(u);
    return acc;
  }, {});

  return (
    <form action={formAction} className="card max-w-2xl space-y-5 p-6">
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
            defaultValue={defaults?.stockUnitId ?? ""}
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
        </div>

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
