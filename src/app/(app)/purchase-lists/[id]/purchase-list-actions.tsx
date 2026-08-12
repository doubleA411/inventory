"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Copy, Trash2 } from "lucide-react";
import { markPurchaseListSent, duplicatePurchaseList, deletePurchaseList } from "../actions";

export function PurchaseListActions({
  id,
  status,
  vendorId,
}: {
  id: string;
  status: string;
  vendorId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" && (
        <button
          className="btn-outline"
          disabled={pending}
          onClick={() => start(async () => void (await markPurchaseListSent(id, vendorId)))}
        >
          <Send className="h-4 w-4" /> Mark as sent
        </button>
      )}
      <button
        className="btn-outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await duplicatePurchaseList(id);
            if (res.ok) router.push(`/purchase-lists/${res.id}/edit`);
          })
        }
      >
        <Copy className="h-4 w-4" /> Duplicate
      </button>
      <button
        className="btn-ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this purchase list permanently?"))
            start(async () => {
              await deletePurchaseList(id, vendorId);
              router.push(vendorId ? `/vendors/${vendorId}` : "/purchase-lists");
            });
        }}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
