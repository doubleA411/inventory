"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export function ProductSearch({
  defaultValue,
  onlyLow,
}: {
  defaultValue: string;
  onlyLow: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  // The server already rendered results for `defaultValue` — don't re-fire
  // the same navigation the moment this mounts.
  const skipNext = useRef(true);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("search", value.trim());
      if (onlyLow) params.set("filter", "low");
      router.replace(`/products${params.toString() ? `?${params}` : ""}`, {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [value, onlyLow, router]);

  return (
    <div className="relative min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search by name, code or category…"
        className="input pl-9"
      />
    </div>
  );
}
