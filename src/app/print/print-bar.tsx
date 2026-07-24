"use client";

import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";

export function PrintBar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-(--color-border) bg-(--color-surface) px-4 py-3">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>
      <button className="btn-primary" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print / Save as PDF
      </button>
    </div>
  );
}
