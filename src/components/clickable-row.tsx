"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ClickableRow({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  return (
    <tr
      onClick={() => router.push(href)}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </tr>
  );
}

// Stops the row's own click handler from double-firing when the click
// originated on a real link/button nested inside the row.
export function stopRowClick(e: MouseEvent) {
  e.stopPropagation();
}
