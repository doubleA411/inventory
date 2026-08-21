"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/sheet";
import { fmtQty } from "@/lib/utils";
import { logMovementAction, type ActionState } from "./actions";
import type { ProductRow } from "@/lib/queries";

export type QuickUnit = { id: string; name: string; symbol: string; groupId: string };
export type QuickVendor = { id: string; name: string };
export type QuickEvent = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string | null;
};

/**
 * Log a restock or a usage straight from a product row.
 *
 * Coming back from the market with fourteen things used to mean fourteen visits
 * to fourteen product pages. Same server action as the full panel on the
 * product page — only the way in is shorter, so nothing can drift between the
 * two. Deliberately just the two movements a caterer does daily: waste and
 * count corrections are rarer and still live on the product page, where the
 * batch list gives them the context they need.
 */
export function QuickMovementSheet({
  product,
  mode,
  units,
  vendors,
  events,
  onClose,
}: {
  product: ProductRow | null;
  mode: "restock" | "usage";
  units: QuickUnit[];
  vendors: QuickVendor[];
  events: QuickEvent[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logMovementAction,
    {},
  );
  // Derived from the action result rather than mirrored into state: setting
  // state inside the effect would re-render just to say what `state` already
  // says, and the parent remounts this per open so nothing stale survives.
  const saved = state.ok === true;

  useEffect(() => {
    if (!saved) return;
    router.refresh();
    // Closes itself so a market trip is enter-quantity, save, next item —
    // rather than save, then hunt for the close button fourteen times.
    const t = setTimeout(onClose, 700);
    return () => clearTimeout(t);
  }, [saved, router, onClose]);

  if (!product) return null;

  // Only units the stock unit can actually convert to.
  const usable = units.filter((u) => u.groupId === product.unitGroupId);
  const restock = mode === "restock";

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${restock ? "Add stock" : "Use stock"} — ${product.name}`}
    >
      <form action={formAction} key={`${product.id}-${mode}`} className="space-y-4">
        <input type="hidden" name="productId" value={product.id} />
        <input type="hidden" name="type" value={restock ? "restock" : "usage"} />

        <p className="text-sm text-(--color-muted)">
          In stock now: {fmtQty(product.currentStock)} {product.unitSymbol}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="qms-quantity">
              How much? *
            </label>
            <input
              id="qms-quantity"
              name="quantity"
              type="number"
              step="any"
              min="0"
              required
              autoFocus
              className="input"
              placeholder="0"
            />
          </div>
          <div>
            <label className="label" htmlFor="qms-unit">
              Unit
            </label>
            <select
              id="qms-unit"
              name="unitId"
              defaultValue={product.stockUnitId}
              className="input"
            >
              {usable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.symbol} — {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {restock ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="qms-cost">
                  Cost per unit *
                </label>
                <input
                  id="qms-cost"
                  name="unitCost"
                  type="number"
                  step="any"
                  min="0"
                  required
                  defaultValue={product.costPrice ? String(product.costPrice) : ""}
                  className="input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label" htmlFor="qms-expiry">
                  Expiry (optional)
                </label>
                <input id="qms-expiry" name="expiryDate" type="date" className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="qms-vendor">
                  Bought from (optional)
                </label>
                <select id="qms-vendor" name="vendorId" className="input" defaultValue="">
                  <option value="">— Not tracked to a vendor —</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="qms-paid">
                  Paid now (optional)
                </label>
                <input
                  id="qms-paid"
                  name="paidNow"
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  placeholder="0.00"
                />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="qms-event">
              Which function is this for? (optional)
            </label>
            {events.length > 0 ? (
              <select id="qms-event" name="quotationId" className="input" defaultValue="">
                <option value="">— General kitchen use —</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.customerName ?? "Walk-in"}
                    {e.eventDate ? ` · ${e.eventDate}` : ""} · {e.number}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-(--color-muted)">
                No functions yet — this will count as general kitchen cost.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="label" htmlFor="qms-note">
            Note (optional)
          </label>
          <input id="qms-note" name="note" className="input" placeholder="Optional note…" />
        </div>

        {state.error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {state.error}
          </p>
        )}
        {saved && (
          <p className="rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
            Saved. Stock updated.
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : restock ? "Add stock" : "Use stock"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
