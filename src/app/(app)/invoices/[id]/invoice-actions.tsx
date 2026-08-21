"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Ban, Trash2, ShieldCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import {
  setInvoiceStatus,
  deleteInvoice,
  approveInvoice,
  revokeInvoiceApproval,
} from "../actions";

export function InvoiceActions({
  id,
  status,
  approved,
  isOwner,
}: {
  id: string;
  status: string;
  approved: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Approval */}
        {approved ? (
          <>
            <Badge tone="ok">
              <ShieldCheck className="h-3.5 w-3.5" /> Approved
            </Badge>
            {isOwner && status !== "cancelled" && status !== "paid" && (
              <button
                className="btn-ghost"
                disabled={pending}
                onClick={() => start(async () => void (await revokeInvoiceApproval(id)))}
              >
                <RotateCcw className="h-4 w-4" /> Revoke
              </button>
            )}
          </>
        ) : isOwner ? (
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => start(async () => void (await approveInvoice(id)))}
          >
            <ShieldCheck className="h-4 w-4" /> Approve invoice
          </button>
        ) : (
          <Badge tone="warn">Awaiting owner approval</Badge>
        )}

        {status === "draft" && (
          // Stays clickable when unapproved and says why in the page — a greyed
          // button with a hover tooltip tells a phone user nothing. The failure
          // path also lands in the page now instead of a browser alert().
          <button
            className="btn-outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                if (!approved) {
                  setError("The owner needs to approve this invoice before it can be sent.");
                  return;
                }
                const res = await setInvoiceStatus(id, "sent");
                if (!res.ok && res.error) setError(res.error);
              })
            }
          >
            <Send className="h-4 w-4" /> Mark as sent
          </button>
        )}

        {status !== "cancelled" && status !== "paid" && (
          <ConfirmButton
            className="btn-outline"
            icon={<Ban className="h-4 w-4" />}
            label="Cancel"
            question="Cancel this invoice?"
            detail="It stays on record but stops counting towards your totals."
            confirmLabel="Cancel invoice"
            busyLabel="Cancelling…"
            disabled={pending}
            onConfirm={async () => {
              setError(null);
              const res = await setInvoiceStatus(id, "cancelled");
              if (!res.ok && res.error) setError(res.error);
            }}
          />
        )}

        <ConfirmButton
          icon={<Trash2 className="h-4 w-4" />}
          label="Delete"
          question="Delete this invoice?"
          detail="It disappears for good. If money was collected, cancel it instead."
          confirmLabel="Delete invoice"
          busyLabel="Deleting…"
          disabled={pending}
          onConfirm={async () => {
            setError(null);
            const res = await deleteInvoice(id);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push("/invoices");
          }}
        />
      </div>

      {error && <p className="text-sm text-(--color-danger)">{error}</p>}
    </div>
  );
}
