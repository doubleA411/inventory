import Link from "next/link";
import { requireAuth, hasRole } from "@/lib/auth";
import { listProducts } from "@/lib/queries";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { CostTrendBadge } from "@/components/cost-trend";
import { ProductSearch } from "./product-search";
import { fmtQty } from "@/lib/utils";
import { Plus } from "lucide-react";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const { organization, role } = await requireAuth();
  const sp = await searchParams;
  const onlyLow = sp.filter === "low";
  const products = await listProducts(organization.id, {
    search: sp.search,
    onlyLow,
  });
  const canEdit = hasRole(role, "admin");

  const reportParams = new URLSearchParams();
  if (sp.search) reportParams.set("search", sp.search);
  if (onlyLow) reportParams.set("filter", "low");
  const reportHref = `/print/report/products${
    reportParams.toString() ? `?${reportParams.toString()}` : ""
  }`;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} item${products.length === 1 ? "" : "s"}${
          onlyLow ? " below reorder level" : ""
        }`}
        action={
          <div className="flex gap-2">
            <Link href={reportHref} className="btn-outline">
              Export PDF
            </Link>
            {canEdit && (
              <Link href="/products/new" className="btn-primary">
                <Plus className="h-4 w-4" /> Add product
              </Link>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ProductSearch defaultValue={sp.search ?? ""} onlyLow={onlyLow} />
        <div className="flex gap-2">
          <Link
            href="/products"
            className={onlyLow ? "btn-outline" : "btn-primary"}
          >
            All
          </Link>
          <Link
            href="/products?filter=low"
            className={onlyLow ? "btn-primary" : "btn-outline"}
          >
            Low stock
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products found"
          description={
            sp.search
              ? "Try a different search."
              : "Add your first product or import a list to get started."
          }
          action={
            canEdit && (
              <div className="flex justify-center gap-2">
                <Link href="/products/new" className="btn-primary">
                  Add product
                </Link>
                <Link href="/import" className="btn-outline">
                  Import CSV/XLSX
                </Link>
              </div>
            )
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">In stock</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder at</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {products.map((p) => {
                  const status =
                    p.currentStock <= 0
                      ? { tone: "danger" as const, label: "Out of stock" }
                      : p.currentStock <= p.reorderLevel
                        ? { tone: "warn" as const, label: "Low" }
                        : { tone: "ok" as const, label: "OK" };
                  return (
                    <tr key={p.id} className="hover:bg-(--color-bg)">
                      <td className="px-4 py-3">
                        <Link
                          href={`/products/${p.id}`}
                          className="font-medium hover:underline"
                        >
                          {p.name}
                        </Link>
                        {p.code && (
                          <span className="ml-2 font-mono text-xs text-(--color-muted)">
                            {p.code}
                          </span>
                        )}
                        <CostTrendBadge
                          trend={p.costTrend}
                          currency={organization.currency}
                          unitSymbol={p.unitSymbol}
                        />
                      </td>
                      <td className="px-4 py-3 text-(--color-muted)">
                        {p.categoryName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {fmtQty(p.currentStock)}{" "}
                        <span className="text-(--color-muted)">{p.unitSymbol}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-(--color-muted)">
                        {fmtQty(p.reorderLevel)} {p.unitSymbol}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
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
