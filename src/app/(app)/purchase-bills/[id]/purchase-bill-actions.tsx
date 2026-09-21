"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Ban } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
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
  const [pending] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "cancelled" && (
        <ConfirmButton
          className="btn-outline"
          icon={<Ban className="h-4 w-4" />}
          label="Cancel"
          question="Cancel this purchase bill?"
          detail="Stock you already received stays in inventory."
          confirmLabel="Cancel bill"
          busyLabel="Cancelling…"
          disabled={pending}
          onConfirm={async () => void (await cancelPurchaseBill(id, vendorId))}
        />
      )}
      <ConfirmButton
        icon={<Archive className="h-4 w-4" />}
        label="Archive"
        question="Archive this purchase bill?"
        detail="It leaves active purchasing views. Its lines, payments, and received stock stay recoverable."
        confirmLabel="Archive bill"
        busyLabel="Archiving…"
        disabled={pending}
        onConfirm={async () => {
          await deletePurchaseBill(id, vendorId);
          router.push(vendorId ? `/vendors/${vendorId}` : "/vendors");
        }}
      />
    </div>
  );
}
