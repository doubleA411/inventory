"use client";

import { useRouter } from "next/navigation";
import { Archive, Pencil } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteExpenseAction } from "./actions";

export function ExpenseRowActions({ id, onEdit }: { id: string; onEdit: () => void }) {
  const router = useRouter();

  return (
    <span className="flex items-center justify-end gap-1">
      <button type="button" className="btn-ghost px-1.5 py-1" title="Edit" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <ConfirmButton
        compact
        className="px-1.5 py-1"
        icon={<Archive className="h-3.5 w-3.5" />}
        label=""
        triggerTitle="Archive expense"
        question="Archive this expense?"
        confirmLabel="Archive expense"
        busyLabel="Archiving…"
        onConfirm={async () => {
          await deleteExpenseAction(id);
          router.refresh();
        }}
      />
    </span>
  );
}
