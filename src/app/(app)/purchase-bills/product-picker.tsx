"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { createProductQuick } from "../products/actions";

export type PickableProduct = {
  id: string;
  name: string;
  stockUnitId: string;
  costPrice: string | null;
};
export type PickerUnit = { id: string; symbol: string; name: string };

/**
 * Type-to-find product picker for a purchase bill line.
 *
 * Replaces a native <select> listing every product alphabetically. With ninety
 * items that is a scroll, not a choice — and it had no way out when the thing
 * you just bought isn't in the list yet, so a new ingredient meant abandoning
 * the half-typed bill to go and create it. Same shape as the customer picker in
 * the quotation editor, including creating the missing one inline.
 */
export function ProductPicker({
  products,
  units,
  value,
  onPick,
  onCreated,
}: {
  products: PickableProduct[];
  units: PickerUnit[];
  value: string;
  onPick: (productId: string) => void;
  /** A product that didn't exist a moment ago — the caller adds it to its list. */
  onCreated: (product: PickableProduct) => void;
}) {
  const selected = products.find((p) => p.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The bill's table sits in an overflow-x-auto wrapper, which clips anything
  // absolutely positioned inside it — the list rendered but was invisible. So
  // the menu goes to the body and is positioned against the input instead.
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const placeMenu = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 224) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    window.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      window.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [open, placeMenu]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 8);
  }, [products, query]);

  const exact = products.some((p) => p.name.trim().toLowerCase() === query.trim().toLowerCase());
  const canOfferCreate = query.trim().length > 0 && !exact;

  function choose(p: PickableProduct) {
    onPick(p.id);
    setQuery(p.name);
    setOpen(false);
    setCreating(false);
  }

  function createNow() {
    setError(null);
    if (!unitId) {
      setError("Choose a unit for the new product.");
      return;
    }
    start(async () => {
      const res = await createProductQuick({
        name: query.trim(),
        stockUnitId: unitId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const created: PickableProduct = {
        id: res.id,
        name: query.trim(),
        stockUnitId: unitId,
        costPrice: null,
      };
      onCreated(created);
      choose(created);
    });
  }

  const menu =
    open && menuRect
      ? createPortal(
          <div
            className="fixed z-50 rounded-lg border border-(--color-border) bg-(--color-surface) py-1 shadow-lg"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          >
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-(--color-bg)"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  choose(p);
                }}
              >
                {p.name}
              </button>
            ))}

            {matches.length === 0 && !canOfferCreate && (
              <p className="px-3 py-1.5 text-sm text-(--color-muted)">No products match.</p>
            )}

            {canOfferCreate && !creating && (
              <button
                type="button"
                className="block w-full border-t border-(--color-border) px-3 py-1.5 text-left text-sm text-(--color-primary) hover:bg-(--color-bg)"
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  setCreating(true);
                  setError(null);
                }}
              >
                Add &ldquo;{query.trim()}&rdquo; as a new product
              </button>
            )}

            {creating && (
              <div className="space-y-2 border-t border-(--color-border) px-3 py-2">
                <div className="text-xs text-(--color-muted)">
                  New product &ldquo;{query.trim()}&rdquo; — what is it measured in?
                </div>
                <select
                  className="input"
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
                >
                  <option value="">Choose a unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.symbol} — {u.name}
                    </option>
                  ))}
                </select>
                {error && <p className="text-xs text-(--color-danger)">{error}</p>}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary h-8 px-2 text-xs"
                    disabled={pending}
                    onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
                    onClick={createNow}
                  >
                    {pending ? "Adding…" : "Add and use it"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost h-8 px-2 text-xs"
                    disabled={pending}
                    onClick={() => setCreating(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative" ref={anchorRef}>
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--color-muted)" />
      <input
        className="input pl-7"
        placeholder="Type to find a product…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCreating(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Let a click on a menu row register before closing, then snap the
          // text back to whatever is actually selected so a half-typed search
          // doesn't sit there looking like a choice.
          blurTimer.current = setTimeout(() => {
            if (creating) return;
            setOpen(false);
            setQuery(products.find((p) => p.id === value)?.name ?? "");
          }, 140);
        }}
      />
      {menu}
    </div>
  );
}
