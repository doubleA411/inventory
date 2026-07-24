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
            disabled={pending || !approved}
            title={!approved ? "Needs owner approval first" : undefined}
            onClick={() =>
              start(async () => {
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
        <button
          className="btn-ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Delete this quotation?"))
              start(async () => {
                await deleteQuotation(id);
                router.push("/quotations");
              });
          }}
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        {error && <span className="text-sm text-(--color-danger)">{error}</span>}
      </div>
    </div>
  );
}
