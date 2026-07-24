"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAQ } from "@/lib/help-content";

export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ;
    return FAQ.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (it) =>
          it.q.toLowerCase().includes(q) ||
          it.a.toLowerCase().includes(q) ||
          it.tags.some((t) => t.includes(q)),
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const totalMatches = filtered.reduce((s, c) => s + c.items.length, 0);

  return (
    <div className="space-y-6">
      {/* Tour CTA */}
      <div className="card flex flex-wrap items-center justify-between gap-3 bg-(--color-primary-soft) p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-(--color-primary) text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-(--color-fg)">New here?</div>
            <div className="text-sm text-(--color-muted)">
              Take the 60-second guided tour of the platform.
            </div>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => window.dispatchEvent(new Event("sk:start-tour"))}
        >
          <Sparkles className="h-4 w-4" /> Take a tour
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-muted)" />
        <input
          className="input pl-9"
          placeholder="Search help — e.g. restock, expiry, import…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {query && (
        <p className="text-sm text-(--color-muted)">
          {totalMatches} result{totalMatches === 1 ? "" : "s"} for “{query}”
        </p>
      )}

      {/* FAQ */}
      {filtered.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-(--color-muted)">
          No answers matched. Try different words, or take the tour above.
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((cat) => (
            <div key={cat.category}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-(--color-muted)">
                {cat.category}
              </h2>
              <div className="card divide-y divide-(--color-border)">
                {cat.items.map((it) => {
                  const id = it.q;
                  const isOpen = open === id;
                  return (
                    <div key={id}>
                      <button
                        onClick={() => setOpen(isOpen ? null : id)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        aria-expanded={isOpen}
                      >
                        <span className="text-sm font-medium">{it.q}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-(--color-muted) transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 text-sm leading-relaxed text-(--color-muted)">
                          {it.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
