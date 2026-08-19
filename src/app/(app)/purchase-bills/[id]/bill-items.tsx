"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { fmtMoney } from "@/lib/utils";
import { removePurchaseBillItem } from "../actions";

/** Mirrors RemoveBillItemMode in @/lib/purchases (server-only, so not imported here). */
type RemoveMode = "unlink" | "delete_restock";

export type BillItemRow = {
  id: string;
  productId: string | null;
  description: string;
  quantity: string;
  unit: string | null;
  rate: string;
  amount: string;
  stock: { remaining: number; received: number; intact: boolean } | null;
};

/**
 * The bill's line items, with a way to take one back off. Removing a line is
 * two different things depending on what the user is fixing — a line billed to
 * the wrong vendor (keep the stock, drop the line) versus a restock that never
 * should have been entered (drop both) — so the row asks which one it is
 * instead of guessing.
 */
export function BillItems({
  billId,
  vendorId,
  items,
  total,
  currency,
  editable,
}: {
  billId: string;
  vendorId: string | null;
  items: BillItemRow[];
  total: string;
  currency: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(itemId: string, mode: RemoveMode) {
    setError(null);
    start(async () => {
      const result = await removePurchaseBillItem(billId, itemId, mode, vendorId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 text-right font-medium">Qty</th>
              <th className="px-4 py-2 text-right font-medium">Rate</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              {editable && <th className="w-10 px-2 py-2" aria-label="Remove" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-(--color-border)">
            {items.map((i) => (
              <RowGroup
                key={i.id}
                item={i}
                currency={currency}
                editable={editable}
                open={openId === i.id}
                pending={pending}
                error={openId === i.id ? error : null}
                onOpen={() => {
                  setError(null);
                  setOpenId(openId === i.id ? null : i.id);
                }}
                onRemove={(mode) => remove(i.id, mode)}
              />
            ))}
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={editable ? 5 : 4}
                  className="px-4 py-6 text-center text-sm text-(--color-muted)"
                >
                  Every line has been removed from this bill.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end border-t border-(--color-border) p-4">
        <table className="text-sm">
          <tbody>
            <tr>
              <td className="pr-8 pt-1 font-semibold">Total</td>
              <td className="pt-1 text-right text-base font-semibold tabular-nums">
                {fmtMoney(total, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowGroup({
  item,
  currency,
  editable,
  open,
  pending,
  error,
  onOpen,
  onRemove,
}: {
  item: BillItemRow;
  currency: string;
  editable: boolean;
  open: boolean;
  pending: boolean;
  error: string | null;
  onOpen: () => void;
  onRemove: (mode: RemoveMode) => void;
}) {
  // A charge line (delivery, packing…) never created stock, so there's only
  // one thing removing it can mean.
  const isProduct = Boolean(item.productId);
  const canDeleteRestock = isProduct && item.stock != null && item.stock.intact;

  return (
    <>
      <tr>
        <td className="px-4 py-2">{item.description}</td>
        <td className="px-4 py-2 text-right tabular-nums">
          {isProduct ? `${Number(item.quantity)} ${item.unit ?? ""}` : "—"}
        </td>
        <td className="px-4 py-2 text-right tabular-nums">
          {isProduct ? fmtMoney(item.rate, currency) : "—"}
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(item.amount, currency)}</td>
        {editable && (
          <td className="px-2 py-2 text-right">
            <button
              type="button"
              className="btn-ghost"
              onClick={onOpen}
              disabled={pending}
              aria-expanded={open}
              title="Remove this line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </td>
        )}
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-(--color-bg) px-4 py-3">
            <div className="space-y-3">
              <div className="text-sm font-medium">Remove &ldquo;{item.description}&rdquo;?</div>
              {error && <p className="text-sm text-(--color-danger)">{error}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-outline"
                  disabled={pending}
                  onClick={() => onRemove("unlink")}
                >
                  Unlink from vendor
                </button>
                {isProduct && (
                  <button
                    type="button"
                    className="btn-outline text-(--color-danger)"
                    disabled={pending || !canDeleteRestock}
                    onClick={() => onRemove("delete_restock")}
                    title={
                      canDeleteRestock
                        ? undefined
                        : "This stock is already partly used or gone — it can't be deleted."
                    }
                  >
                    Delete the restock too
                  </button>
                )}
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={pending}
                  onClick={onOpen}
                >
                  Keep it
                </button>
              </div>
              <p className="text-xs text-(--color-muted)">
                {isProduct ? (
                  <>
                    <strong>Unlink</strong> takes the line off this bill and off the vendor&rsquo;s
                    dues — the stock stays in inventory.{" "}
                    {canDeleteRestock ? (
                      <>
                        <strong>Delete the restock</strong> also removes the{" "}
                        {item.stock?.received} it brought in, as if it was never entered.
                      </>
                    ) : item.stock == null ? (
                      <>The stock it brought in is no longer tracked to this line, so it
                      can&rsquo;t be deleted from here.</>
                    ) : (
                      <>
                        It can&rsquo;t be deleted — {item.stock.remaining} of{" "}
                        {item.stock.received} is left, so some has already been used.
                      </>
                    )}
                  </>
                ) : (
                  <>This is a charge line, so removing it only lowers the bill total.</>
                )}
              </p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
