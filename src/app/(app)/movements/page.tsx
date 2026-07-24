import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import {
  listAllMovements,
  listCategories,
  usageCostSummary,
  usageCostByDay,
} from "@/lib/queries";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { fmtQty, fmtDate, fmtMoney } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";

const TYPES = [
  { key: "", label: "All types" },
  { key: "restock", label: "Restock" },
  { key: "usage", label: "Usage" },
  { key: "waste", label: "Waste" },
  { key: "adjustment", label: "Adjustment" },
];

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    category?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { organization } = await requireAuth();
  const cur = organization.currency;
  const sp = await searchParams;
  const [movements, categories, summary, daily] = await Promise.all([
    listAllMovements(organization.id, {
      type: sp.type,
      categoryId: sp.category,
      from: sp.from,
      to: sp.to,
    }),
    listCategories(organization.id),
    usageCostSummary(organization.id),
    usageCostByDay(organization.id, 14),
  ]);
  const maxDay = Math.max(1, ...daily.map((d) => d.cost));
  const hasFilters = !!(sp.type || sp.category || sp.from || sp.to);
  const filteredCost = movements.reduce((s, m) => s + Number(m.costAmount), 0);

  const exportParams = new URLSearchParams({ type: "movements" });
  if (sp.type) exportParams.set("mtype", sp.type);
  if (sp.category) exportParams.set("category", sp.category);
  if (sp.from) exportParams.set("from", sp.from);
  if (sp.to) exportParams.set("to", sp.to);
  const exportHref = `/api/export?${exportParams.toString()}`;

  const reportParams = new URLSearchParams();
  if (sp.type) reportParams.set("type", sp.type);
  if (sp.category) reportParams.set("category", sp.category);
  if (sp.from) reportParams.set("from", sp.from);
  if (sp.to) reportParams.set("to", sp.to);
  const reportHref = `/print/report/stock-history${
    reportParams.toString() ? `?${reportParams.toString()}` : ""
  }`;

  return (
    <div>
      <PageHeader
        title="Stock History"
        subtitle="Every restock, usage, waste and adjustment — with cost of stock used."
        action={
          <div className="flex gap-2">
            <Link href={exportHref} className="btn-outline">
              Export CSV
            </Link>
            <Link href={reportHref} className="btn-outline">
              Export PDF
            </Link>
          </div>
        }
      />

      {/* Usage cost summary */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Stock used today"
          value={fmtMoney(summary.today, cur)}
          hint="cost of usage & waste"
        />
        <StatCard
          label="Stock used this month"
          value={fmtMoney(summary.month, cur)}
          hint="cost of usage & waste"
        />
        <div className="card p-4 lg:row-span-1">
          <div className="mb-2 text-sm font-semibold">Daily stock-used cost</div>
          {daily.length === 0 ? (
            <div className="py-2 text-sm text-(--color-muted)">
              No usage recorded yet.
            </div>
          ) : (
            <div className="space-y-1.5">
              {daily.slice(0, 7).map((d) => (
                <div key={d.day} className="flex items-center gap-2 text-xs">
                  <span className="w-16 shrink-0 text-(--color-muted)">
                    {fmtDate(d.day)}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-bg)">
                    <div
                      className="h-full rounded-full bg-(--color-primary)"
                      style={{ width: `${Math.max(4, (d.cost / maxDay) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right tabular-nums">
                    {fmtMoney(d.cost, cur)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <form
        method="get"
        className="card mb-4 flex flex-wrap items-end gap-3 p-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-muted)">Type</label>
          <select name="type" defaultValue={sp.type ?? ""} className="input w-40">
            {TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-muted)">
            Product type
          </label>
          <select name="category" defaultValue={sp.category ?? ""} className="input w-44">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-muted)">From</label>
          <input type="date" name="from" defaultValue={sp.from ?? ""} className="input" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--color-muted)">To</label>
          <input type="date" name="to" defaultValue={sp.to ?? ""} className="input" />
        </div>
        <button type="submit" className="btn-primary">
          Apply
        </button>
        {hasFilters && (
          <Link href="/movements" className="btn-ghost">
            Clear
          </Link>
        )}
        {hasFilters && (
          <span className="ml-auto self-center text-sm text-(--color-muted)">
            {movements.length} result{movements.length === 1 ? "" : "s"} · cost{" "}
            <span className="font-medium text-(--color-fg)">
              {fmtMoney(filteredCost, cur)}
            </span>
          </span>
        )}
      </form>

      {movements.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Stock changes will appear here as your team restocks and uses items."
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Bill</th>
                  <th className="px-4 py-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {movements.map((m) => {
                  const meta = MOVEMENT_META[m.type];
                  return (
                    <tr key={m.id} className="hover:bg-(--color-bg)">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${m.productId}`}
                          className="font-medium hover:underline"
                        >
                          {m.productName}
                        </Link>
                        {m.note && (
                          <div className="text-xs text-(--color-muted)">{m.note}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {meta.sign}
                        {fmtQty(m.quantity)} {m.unitSymbol}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-(--color-muted)">
                        {Number(m.costAmount) > 0 ? fmtMoney(m.costAmount, cur) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {m.invoiceId ? (
                          <Link
                            href={`/invoices/${m.invoiceId}`}
                            className="text-(--color-primary) hover:underline"
                          >
                            {m.invoiceNumber}
                          </Link>
                        ) : (
                          <span className="text-(--color-muted)">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">
                        {fmtDate(m.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
