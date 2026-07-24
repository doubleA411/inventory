"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Ban, Trash2, ShieldCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui";
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

  return (
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
        <button
          className="btn-outline"
          disabled={pending || !approved}
          title={!approved ? "Needs owner approval first" : undefined}
          onClick={() =>
            start(async () => {
              const res = await setInvoiceStatus(id, "sent");
              if (!res.ok && res.error) alert(res.error);
            })
          }
        >
          <Send className="h-4 w-4" /> Mark as sent
        </button>
      )}
      {status !== "cancelled" && status !== "paid" && (
        <button
          className="btn-outline"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancel this invoice?"))
              start(async () => void (await setInvoiceStatus(id, "cancelled")));
          }}
        >
          <Ban className="h-4 w-4" /> Cancel
        </button>
      )}
      <button
        className="btn-ghost"
        disabled={pending}
        onClick={() => {
          if (confirm("Delete this invoice permanently?"))
            start(async () => {
              await deleteInvoice(id);
              router.push("/invoices");
            });
        }}
        title="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
