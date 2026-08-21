"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Check, X, Trash2, ShieldCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  setQuotationStatus,
  deleteQuotation,
  convertToInvoice,
  approveQuotation,
  revokeQuotationApproval,
} from "../actions";

export function QuoteActions({
  id,
  status,
  convertedInvoiceId,
  approved,
  isOwner,
}: {
  id: string;
  status: string;
  convertedInvoiceId: string | null;
  approved: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const converted = status === "converted";

  return (
    <div className="space-y-3">
      {/* Approval row */}
      <div className="flex flex-wrap items-center gap-2">
        {approved ? (
          <>
            <Badge tone="ok">
              <ShieldCheck className="h-3.5 w-3.5" /> Approved
            </Badge>
            {isOwner && !converted && (
              <button
                className="btn-ghost"
                disabled={pending}
                onClick={() => start(async () => void (await revokeQuotationApproval(id)))}
              >
                <RotateCcw className="h-4 w-4" /> Revoke
              </button>
            )}
          </>
        ) : isOwner ? (
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() => start(async () => void (await approveQuotation(id)))}
          >
            <ShieldCheck className="h-4 w-4" /> Approve quotation
          </button>
        ) : (
          <Badge tone="warn">Awaiting owner approval</Badge>
        )}
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2">
        {converted && convertedInvoiceId ? (
          <button className="btn-outline" onClick={() => router.push(`/invoices/${convertedInvoiceId}`)}>
            <FileText className="h-4 w-4" /> View invoice
          </button>
        ) : (
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                // Stays clickable when unapproved and says why on click — a
                // greyed button with a hover tooltip tells a phone user nothing.
                if (!approved) {
                  setError("The owner needs to approve this quotation before it can be invoiced.");
                  return;
                }
                const res = await convertToInvoice(id);
                if (res.ok) router.push(`/invoices/${res.invoiceId}`);
                else setError(res.error);
              })
            }
          >
            <FileText className="h-4 w-4" /> Convert to invoice
          </button>
        )}
        {!converted && status !== "accepted" && (
          <button
            className="btn-outline"
            disabled={pending}
            onClick={() => start(async () => void (await setQuotationStatus(id, "accepted")))}
          >
            <Check className="h-4 w-4" /> Accepted
          </button>
        )}
        {!converted && status !== "rejected" && (
          <button
            className="btn-outline"
            disabled={pending}
            onClick={() => start(async () => void (await setQuotationStatus(id, "rejected")))}
          >
            <X className="h-4 w-4" /> Rejected
          </button>
        )}
        {/* Labelled, not a bare icon, and it asks in the page rather than in a
            browser dialog — same pattern as reversing a payment. */}
        <button
          className="btn-ghost"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirmDelete(true);
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </button>
        {error && <span className="text-sm text-(--color-danger)">{error}</span>}
      </div>

      {confirmDelete && (
        <div className="space-y-2 rounded-lg border border-(--color-border) bg-(--color-bg) p-3">
          <div className="text-sm font-medium">Delete this quotation?</div>
          <p className="text-xs text-(--color-muted)">
            It disappears for good, along with its menu and booking details. Any expenses you
            logged against this event stay, but stop being counted towards it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-outline text-(--color-danger)"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteQuotation(id);
                  if (!res.ok) {
                    setError(res.error);
                    setConfirmDelete(false);
                    return;
                  }
                  router.push("/quotations");
                })
              }
            >
              {pending ? "Deleting…" : "Delete quotation"}
            </button>
            <button
              className="btn-ghost"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
