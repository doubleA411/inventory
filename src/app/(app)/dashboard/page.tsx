import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { dashboardStats, recentMovements, usageCostSummary } from "@/lib/queries";
import { expensesTotal } from "@/lib/expenses";
import { listUpcomingEvents } from "@/lib/billing-queries";
import { PageHeader, StatCard, Badge, EmptyState } from "@/components/ui";
import { fmtQty, fmtMoney, fmtDate } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";
import { AlertTriangle, CalendarClock, Clock, PackageX, ShieldAlert } from "lucide-react";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { organization, role } = await requireAuth();
  // requireRole() bounces people here when they open something their role
  // can't reach — usually a link someone shared over WhatsApp. Without this
  // the redirect is silent and reads as the app losing their tap.
  const { error } = await searchParams;
  const orgId = organization.id;
  const todayStr = today();
  const [stats, recent, usageCost, expensesToday, upcomingEvents] = await Promise.all([
    dashboardStats(orgId),
    recentMovements(orgId, 12),
    usageCostSummary(orgId),
    expensesTotal(orgId, todayStr, todayStr),
    listUpcomingEvents(orgId),
  ]);
  const todaysExpense = usageCost.today + expensesToday;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${organization.name} · overview of your stock`}
      />

      {error === "forbidden" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-(--color-warn-soft) px-3 py-2.5 text-sm text-(--color-fg)">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-(--color-warn)" />
          <span>
            That page is only for owners and admins, so we brought you back here. You&rsquo;re
            signed in as {role}. Ask the owner if you need access.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
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
          label="Today's expense"
          value={fmtMoney(todaysExpense, organization.currency)}
          hint={`${fmtMoney(usageCost.today, organization.currency)} stock usage · ${fmtMoney(expensesToday, organization.currency)} other`}
          href={`/expenses?from=${todayStr}&to=${todayStr}`}
        />
        <StatCard
          label="Stock value"
          value={fmtMoney(stats.stockValue, organization.currency)}
          hint="valued at each batch's cost"
        />
      </div>

      {/* Alerts — three panels of the same kind, side by side so they line up evenly */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
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
          icon={<Clock className="h-4 w-4" />}
          title="Expiring soon (7 days)"
          tone="warn"
          emptyText="Nothing expiring in the next week."
        >
          {stats.expiringSoon.slice(0, 6).map((b, i) => (
            <ExpiryRow key={i} {...b} tone="warn" />
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

      {/* Upcoming events — only bookings that have actually been taken up
          (advance recorded, or explicitly marked taken), not every accepted
          estimate — see listUpcomingEvents. */}
      <div className="card mt-6">
        <div className="flex items-center gap-2 border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-(--color-primary)" />
          Upcoming events
        </div>
        {upcomingEvents.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
            No confirmed bookings coming up. Record an advance or mark a quotation as taken to
            have it show up here.
          </div>
        ) : (
          <div className="divide-y divide-(--color-border)">
            {upcomingEvents.map((e) => {
              // Reads the invoice's live paid amount once converted, so a
              // reversed payment stops this row claiming money was collected.
              const collected = Number(e.collected ?? 0);
              return (
                <Link
                  key={e.id}
                  href={
                    e.convertedInvoiceId
                      ? `/invoices/${e.convertedInvoiceId}`
                      : `/quotations/${e.id}`
                  }
                  className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-(--color-bg)"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {e.customerName ?? "Walk-in"}
                      {e.venue ? ` · ${e.venue}` : ""}
                    </div>
                    <div className="text-xs text-(--color-muted)">
                      {e.number} · {fmtMoney(e.total, organization.currency)}
                      {collected > 0
                        ? ` · ${fmtMoney(collected, organization.currency)} collected`
                        : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* A held date on an unapproved draft is a real state —
                        staff block the date before the owner signs off — so it
                        is shown, but never dressed up as a settled booking. */}
                    {!e.approvedAt && e.status === "draft" ? (
                      <Badge tone="warn">Draft — not approved</Badge>
                    ) : collected > 0 ? (
                      <Badge tone="ok">Advance paid</Badge>
                    ) : (
                      <Badge tone="default">Date held</Badge>
                    )}
                    <span className="text-sm font-semibold tabular-nums">
                      {fmtDate(e.nextEventDate)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity — the one list that can grow without bound, so it
          scrolls within its own box instead of stretching the whole page. */}
      <div className="card mt-6">
        <div className="flex items-center justify-between border-b border-(--color-border) px-4 py-3">
          <span className="text-sm font-semibold">Recent activity</span>
          <Link
            href="/movements"
            className="text-sm font-medium text-(--color-primary) hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="max-h-96 divide-y divide-(--color-border) overflow-y-auto">
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
