"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProductAction } from "../actions";

export function DeleteProductButton({ productId }: { productId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-sm text-(--color-muted)">Delete?</span>
        <form action={deleteProductAction.bind(null, productId)}>
          <button className="btn-danger" type="submit">
            Yes, delete
          </button>
        </form>
        <button className="btn-ghost" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button className="btn-outline" onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4" /> Delete
    </button>
  );
}
