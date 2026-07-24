import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { dashboardStats, recentMovements } from "@/lib/queries";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { fmtQty, fmtMoney, fmtDate } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";
import { AlertTriangle, Clock, PackageX } from "lucide-react";

export default async function DashboardPage() {
  const { organization } = await requireAuth();
  const orgId = organization.id;
  const [stats, recent] = await Promise.all([
    dashboardStats(orgId),
    recentMovements(orgId, 12),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${organization.name} · overview of your stock`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Products" value={stats.totalProducts} href="/products" />
        <StatCard
          label="Low stock"
          value={stats.lowStock.length}
          tone={stats.lowStock.length ? "warn" : "default"}
          href="/products?filter=low"
        />
        <StatCard
          label="Out of stock"
          value={stats.outOfStock}
          tone={stats.outOfStock ? "danger" : "default"}
        />
        <StatCard
          label="Stock value"
          value={fmtMoney(stats.stockValue, organization.currency)}
          hint="based on cost price"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Alerts column */}
        <div className="space-y-6">
          <AlertPanel
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Low stock"
            tone="warn"
            emptyText="All items above reorder level."
          >
            {stats.lowStock.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-(--color-bg)"
              >
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-sm">
                  <span
                    className={
                      p.currentStock <= 0
                        ? "text-(--color-danger)"
                        : "text-(--color-warn)"
                    }
                  >
                    {fmtQty(p.currentStock)}
                  </span>{" "}
                  <span className="text-(--color-muted)">
                    / {fmtQty(p.reorderLevel)} {p.unitSymbol}
                  </span>
                </span>
              </Link>
            ))}
          </AlertPanel>

          <AlertPanel
            icon={<PackageX className="h-4 w-4" />}
            title="Expired stock"
            tone="danger"
            emptyText="No expired batches."
          >
            {stats.expired.slice(0, 6).map((b, i) => (
              <ExpiryRow key={i} {...b} tone="danger" />
            ))}
          </AlertPanel>
        </div>

        {/* Expiring + recent */}
        <div className="space-y-6">
          <AlertPanel
            icon={<Clock className="h-4 w-4" />}
            title="Expiring soon (7 days)"
            tone="warn"
            emptyText="Nothing expiring in the next week."
          >
            {stats.expiringSoon.slice(0, 6).map((b, i) => (
              <ExpiryRow key={i} {...b} tone="warn" />
            ))}
          </AlertPanel>

          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Recent activity
            </div>
            <div className="divide-y divide-(--color-border)">
              {recent.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-(--color-muted)">
                  No stock movements yet.
                </div>
              ) : (
                recent.map((m) => {
                  const meta = MOVEMENT_META[m.type];
                  return (
                    <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/products/${m.productId}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {m.productName}
                        </Link>
                        <div className="text-xs text-(--color-muted)">
                          {fmtDate(m.createdAt)} · {m.userName ?? "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="text-sm tabular-nums">
                          {meta.sign}
                          {fmtQty(m.quantity)} {m.unitSymbol}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertPanel({
  icon,
  title,
  tone,
  emptyText,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "warn" | "danger";
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) && children.length > 0;
  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
        <span className={tone === "danger" ? "text-(--color-danger)" : "text-(--color-warn)"}>
          {icon}
        </span>
        {title}
      </div>
      <div className="p-2">
        {hasChildren ? (
          children
        ) : (
          <div className="px-2 py-6 text-center text-sm text-(--color-muted)">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpiryRow({
  productId,
  productName,
  expiryDate,
  qty,
  unitSymbol,
  tone,
}: {
  productId: string;
  productName: string;
  expiryDate: string;
  qty: number;
  unitSymbol: string;
  tone: "warn" | "danger";
}) {
  return (
    <Link
      href={`/products/${productId}`}
      className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-(--color-bg)"
    >
      <span className="truncate text-sm font-medium">{productName}</span>
      <span className="flex items-center gap-2 text-sm">
        <span className="text-(--color-muted)">
          {fmtQty(qty)} {unitSymbol}
        </span>
        <Badge tone={tone}>{fmtDate(expiryDate)}</Badge>
      </span>
    </Link>
  );
}
