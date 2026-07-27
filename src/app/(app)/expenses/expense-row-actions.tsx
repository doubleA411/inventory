"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { deleteExpenseAction } from "./actions";

export function ExpenseRowActions({ id, onEdit }: { id: string; onEdit: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    if (!confirm("Delete this expense?")) return;
    start(async () => {
      await deleteExpenseAction(id);
      router.refresh();
    });
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <button type="button" className="btn-ghost px-1.5 py-1" title="Edit" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        className="btn-ghost px-1.5 py-1"
        title="Delete"
        onClick={onDelete}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
