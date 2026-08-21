"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Copy, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
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
      <ConfirmButton
        icon={<Trash2 className="h-4 w-4" />}
        label="Delete"
        question="Delete this purchase list?"
        detail="It disappears for good."
        confirmLabel="Delete list"
        busyLabel="Deleting…"
        disabled={pending}
        onConfirm={async () => {
          await deletePurchaseList(id, vendorId);
          router.push(vendorId ? `/vendors/${vendorId}` : "/purchase-lists");
        }}
      />
    </div>
  );
}
