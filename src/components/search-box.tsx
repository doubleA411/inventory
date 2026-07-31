"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Debounced, URL-driven search box. Writes to the `search` query param 300ms
 * after the user stops typing (via router.replace, so it doesn't spam
 * history). `otherParams` carries any other filters already on the page
 * (date range, category, ...) so they survive the navigation unchanged.
 */
export function SearchBox({
  basePath,
  defaultValue,
  otherParams,
  placeholder = "Search…",
}: {
  basePath: string;
  defaultValue: string;
  otherParams?: Record<string, string | undefined>;
  placeholder?: string;
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
      for (const [k, v] of Object.entries(otherParams ?? {})) {
        if (v) params.set(k, v);
      }
      if (value.trim()) params.set("search", value.trim());
      router.replace(`${basePath}${params.toString() ? `?${params}` : ""}`, {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative min-w-[220px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  );
}
