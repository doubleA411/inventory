"use client";

import { useRouter } from "next/navigation";
import { fmtDate } from "@/lib/utils";

type CategoryLite = { id: string; name: string };
type QuotationLite = {
  id: string;
  number: string;
  customerName: string | null;
  eventDate: string;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function presetRange(preset: "today" | "week" | "month"): { from: string; to: string } {
  const now = new Date();
  const to = isoDate(now);
  if (preset === "today") return { from: to, to };
  if (preset === "week") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    return { from: isoDate(start), to };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(start), to };
}

export function ExpenseFilters({
  categories,
  quotations,
  from,
  to,
  category,
  quotationId,
}: {
  categories: CategoryLite[];
  quotations: QuotationLite[];
  from: string;
  to: string;
  category?: string;
  quotationId?: string;
}) {
  const router = useRouter();

  function navigate(next: { from?: string; to?: string; category?: string; quotationId?: string }) {
    const params = new URLSearchParams();
    const merged = { from, to, category, quotationId, ...next };
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.category) params.set("category", merged.category);
    if (merged.quotationId) params.set("quotationId", merged.quotationId);
    router.push(`/expenses?${params.toString()}`);
  }

  function applyPreset(preset: "today" | "week" | "month") {
    navigate(presetRange(preset));
  }

  const today = presetRange("today");
  const week = presetRange("week");
  const month = presetRange("month");
  const activePreset =
    from === today.from && to === today.to
      ? "today"
      : from === week.from && to === week.to
        ? "week"
        : from === month.from && to === month.to
          ? "month"
          : "custom";

  return (
    <div className="card mb-4 space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={activePreset === "today" ? "btn-primary" : "btn-outline"}
          onClick={() => applyPreset("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={activePreset === "week" ? "btn-primary" : "btn-outline"}
          onClick={() => applyPreset("week")}
        >
          This week
        </button>
        <button
          type="button"
          className={activePreset === "month" ? "btn-primary" : "btn-outline"}
          onClick={() => applyPreset("month")}
        >
          This month
        </button>
        <span className="mx-1 h-5 w-px bg-(--color-border)" />
        <input
          type="date"
          className="input w-auto"
          value={from}
          onChange={(e) => navigate({ from: e.target.value })}
        />
        <span className="text-sm text-(--color-muted)">to</span>
        <input
          type="date"
          className="input w-auto"
          value={to}
          onChange={(e) => navigate({ to: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={category ?? ""}
          onChange={(e) => navigate({ category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          <option value="stock">Stock usage</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={quotationId ?? ""}
          onChange={(e) => navigate({ quotationId: e.target.value || undefined })}
        >
          <option value="">All events</option>
          {quotations.map((q) => (
            <option key={q.id} value={q.id}>
              {q.customerName ?? "Walk-in"} — {fmtDate(q.eventDate)} ({q.number})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
