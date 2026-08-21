"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, Trash2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { logMovementAction, type ActionState } from "../actions";
import type { MovementType } from "@/lib/db/schema";

type Unit = { id: string; name: string; symbol: string };
type EventOption = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string | null;
};
type VendorOption = { id: string; name: string };

const TABS: {
  type: MovementType;
  label: string;
  icon: React.ElementType;
  activeClass: string;
}[] = [
  { type: "restock", label: "Restock", icon: ArrowUpCircle, activeClass: "bg-(--color-ok-soft) text-(--color-ok)" },
  { type: "usage", label: "Use", icon: ArrowDownCircle, activeClass: "bg-(--color-danger-soft) text-(--color-danger)" },
  { type: "waste", label: "Waste", icon: Trash2, activeClass: "bg-(--color-warn-soft) text-(--color-warn)" },
  { type: "adjustment", label: "Adjust", icon: SlidersHorizontal, activeClass: "bg-(--color-primary-soft) text-(--color-primary)" },
];

export function MovementPanel({
  productId,
  units,
  defaultUnitId,
  events = [],
  vendors = [],
  defaultVendorId,
  lastCostPrice,
}: {
  productId: string;
  units: Unit[];
  defaultUnitId: string;
  events?: EventOption[];
  vendors?: VendorOption[];
  defaultVendorId?: string | null;
  lastCostPrice?: number | null;
}) {
  const [type, setType] = useState<MovementType>("restock");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    logMovementAction,
    {},
  );
  const router = useRouter();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (state.ok) {
      setJustSaved(true);
      router.refresh();
      const t = setTimeout(() => setJustSaved(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <div className="card p-4">
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = type === t.type;
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-xs font-medium transition-colors",
                active ? t.activeClass : "text-(--color-muted) hover:bg-(--color-bg)",
              )}
            >
              <Icon className="h-5 w-5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* key on type resets the form fields when switching tabs */}
      <form action={formAction} key={type} className="space-y-3">
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="type" value={type} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="quantity">
              Quantity *
            </label>
            <input
              id="quantity"
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
            <label className="label" htmlFor="unitId">
              Unit
            </label>
            <select
              id="unitId"
              name="unitId"
              defaultValue={defaultUnitId}
              className="input"
            >
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.symbol} — {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {type === "restock" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="expiryDate">
                Expiry date (optional)
              </label>
              <input id="expiryDate" name="expiryDate" type="date" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="unitCost">
                Cost per unit *
              </label>
              <input
                id="unitCost"
                name="unitCost"
                type="number"
                step="any"
                min="0"
                required
                defaultValue={lastCostPrice != null ? String(lastCostPrice) : ""}
                className="input"
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        {type === "restock" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="vendorId">
                Vendor (optional)
              </label>
              <select
                id="vendorId"
                name="vendorId"
                className="input"
                defaultValue={defaultVendorId ?? ""}
              >
                <option value="">— Not tracked to a vendor —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              {vendors.length === 0 && (
                <p className="mt-1 text-xs text-(--color-muted)">
                  No vendors yet —{" "}
                  <Link href="/vendors" className="underline">
                    add one
                  </Link>{" "}
                  to track who this was bought from.
                </p>
              )}
            </div>
            <div>
              <label className="label" htmlFor="paidNow">
                Paid now (optional)
              </label>
              <input
                id="paidNow"
                name="paidNow"
                type="number"
                step="any"
                min="0"
                className="input"
                placeholder="0.00"
              />
            </div>
          </div>
        )}

        {type === "adjustment" && (
          <div>
            <label className="label" htmlFor="direction">
              Direction
            </label>
            <select id="direction" name="direction" className="input" defaultValue="decrease">
              <option value="increase">Increase (found extra)</option>
              <option value="decrease">Decrease (count correction)</option>
            </select>
          </div>
        )}

        {/* Attribution is to the function, not the bill. Offered for every
            quotation including drafts, so ingredients can be booked to a job
            on the day it is cooked rather than waiting for it to be invoiced.
            Always rendered — hiding it until an invoice existed meant a new
            caterer never discovered that costs could be attributed at all. */}
        {(type === "usage" || type === "waste") && (
          <div>
            <label className="label" htmlFor="quotationId">
              Which function is this for? (optional)
            </label>
            {events.length > 0 ? (
              <select id="quotationId" name="quotationId" className="input" defaultValue="">
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
          <label className="label" htmlFor="note">
            Note (optional)
          </label>
          <input
            id="note"
            name="note"
            className="input"
            placeholder={type === "waste" ? "Reason for waste…" : "Optional note…"}
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {state.error}
          </p>
        )}
        {justSaved && (
          <p className="rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
            Saved. Stock updated.
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending ? "Saving…" : "Record movement"}
        </button>
      </form>
    </div>
  );
}
