"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Trash2 } from "lucide-react";
import { cancelPurchaseBill, deletePurchaseBill } from "../actions";

export function PurchaseBillActions({
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
      {status !== "cancelled" && (
        <button
          className="btn-outline"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancel this purchase bill? Stock already received stays as-is."))
              start(async () => void (await cancelPurchaseBill(id, vendorId)));
          }}
        >
          <Ban className="h-4 w-4" /> Cancel
        </button>
      )}
      <button
        className="btn-ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this purchase bill permanently? Stock already received stays as-is."))
            start(async () => {
              await deletePurchaseBill(id, vendorId);
              router.push(vendorId ? `/vendors/${vendorId}` : "/vendors");
            });
        }}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
