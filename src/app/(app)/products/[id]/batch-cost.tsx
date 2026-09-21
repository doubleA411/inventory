"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney } from "@/lib/utils";
import { setBatchCostAction } from "../actions";

/**
 * Shows a batch's price, and lets it be set or corrected.
 *
 * Stock can be logged before the vendor's bill arrives, so a batch may start
 * with no price at all — and the figure first entered is often an estimate
 * that the real bill later contradicts. Both need fixing, so this edits any
 * batch rather than only unpriced ones: "you may fill this in once, and only
 * once" would just be a slower version of the trap it was meant to remove.
 */
export function BatchCost({
  batchId,
  unitCost,
  currency,
  partlyUsed,
}: {
  batchId: string;
  unitCost: string | null;
  currency: string;
  /** Some of this batch has already been cooked with — see the note below. */
  partlyUsed: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unitCost ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return unitCost != null ? (
      <button
        type="button"
        className="tabular-nums underline decoration-dotted decoration-(--color-muted) underline-offset-2 hover:text-(--color-fg)"
        title="Change this price"
        onClick={() => {
          setValue(unitCost);
          setEditing(true);
        }}
      >
        {fmtMoney(unitCost, currency)}
      </button>
    ) : (
      <button
        type="button"
        className="text-xs text-(--color-warn) underline decoration-dotted underline-offset-2"
        onClick={() => setEditing(true)}
      >
        Price not set — add it
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        className="input h-7 w-24 text-right"
        type="number"
        step="any"
        min="0"
        autoFocus
        placeholder="per unit"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
      />
      <button
        type="button"
        className="btn-primary h-7 px-2 text-xs"
        disabled={pending || value.trim() === ""}
        onClick={() =>
          start(async () => {
            const res = await setBatchCostAction(batchId, Number(value));
            if (res.error) {
              setError(res.error);
              return;
            }
            setEditing(false);
            router.refresh();
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        className="btn-ghost h-7 px-2 text-xs"
        disabled={pending}
        onClick={() => {
          setEditing(false);
          setValue(unitCost ?? "");
          setError(null);
        }}
      >
        Cancel
      </button>
      {/* Said plainly rather than discovered later: draws don't record which
          batch they came from, so a corrected price applies to what's left,
          not to what has already been cooked with. */}
      {partlyUsed && !error && (
        <span className="text-xs text-(--color-muted)">
          Applies to the stock still here — anything already used keeps the cost it was recorded
          at.
        </span>
      )}
      {error && <span className="text-xs text-(--color-danger)">{error}</span>}
    </span>
  );
}
