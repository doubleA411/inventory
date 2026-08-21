import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth, hasRole } from "@/lib/auth";
import {
  getProductDetail,
  listUnits,
  productUsageTotals,
  EXPIRY_SOON_DAYS,
} from "@/lib/queries";
import { listQuotationsForPicker } from "@/lib/billing-queries";
import { listVendors } from "@/lib/purchase-queries";
import { Badge } from "@/components/ui";
import { fmtQty, fmtDate, fmtMoney } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";
import { MovementPanel } from "./movement-panel";
import { DeleteProductButton } from "./delete-button";
import { ArrowLeft, Pencil } from "lucide-react";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization, role } = await requireAuth();
  const { id } = await params;
  const detail = await getProductDetail(organization.id, id);
  if (!detail) notFound();

  const { product, unit, category, batches, movements } = detail;
  const [allUnits, eventList, usage, vendorList] = await Promise.all([
    listUnits(organization.id),
    // The same event list the expense form uses, so ingredients and other
    // costs are attributed to the job the same way.
    listQuotationsForPicker(organization.id),
    productUsageTotals(id),
    listVendors(organization.id),
  ]);
  // Movement units must share the product's unit group (convertible).
  const convUnits = allUnits
    .filter((u) => u.groupId === unit.groupId)
    .map((u) => ({ id: u.id, name: u.name, symbol: u.symbol }));
  const eventOptions = eventList.slice(0, 100).map((e) => ({
    id: e.id,
    number: e.number,
    customerName: e.customerName,
    eventDate: e.eventDate ? fmtDate(e.eventDate) : null,
  }));
  const cur = organization.currency;

  const stock = Number(product.currentStock);
  const reorder = Number(product.reorderLevel);
  const status =
    stock <= 0
      ? { tone: "danger" as const, label: "Out of stock" }
      : stock <= reorder
        ? { tone: "warn" as const, label: "Low stock" }
        : { tone: "ok" as const, label: "In stock" };
  const canEdit = hasRole(role, "admin");

  const soonMs = Date.now() + EXPIRY_SOON_DAYS * 86400000;
  const todayMs = new Date().setHours(0, 0, 0, 0);

  return (
    <div>
      <Link
        href="/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Products
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-(--color-muted)">
            {product.code && <span className="font-mono">{product.code}</span>}
            {category && <span>{category.name}</span>}
            <span>Unit: {unit.name} ({unit.symbol})</span>
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link href={`/products/${id}/edit`} className="btn-outline">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <DeleteProductButton productId={id} />
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: stock + batches + history */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="card p-4">
              <div className="text-sm text-(--color-muted)">Current stock</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtQty(stock)}{" "}
                <span className="text-base font-normal text-(--color-muted)">
                  {unit.symbol}
                </span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-(--color-muted)">Reorder level</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtQty(reorder)}{" "}
                <span className="text-base font-normal text-(--color-muted)">
                  {unit.symbol}
                </span>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-(--color-muted)">Open batches</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {batches.length}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-(--color-muted)">Used (all-time)</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtQty(usage.qty)}{" "}
                <span className="text-base font-normal text-(--color-muted)">
                  {unit.symbol}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-(--color-muted)">
                {fmtMoney(usage.cost, cur)} cost
              </div>
            </div>
          </div>

          {/* Batches */}
          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Batches (FEFO order)
            </div>
            {batches.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-(--color-muted)">
                No stock on hand. Use “Restock” to add some.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Remaining</th>
                      <th className="px-4 py-2 font-medium">Cost/unit</th>
                      <th className="px-4 py-2 font-medium">Received</th>
                      <th className="px-4 py-2 font-medium">Expiry</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {batches.map((b) => {
                      const exp = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
                      const expTone =
                        exp == null
                          ? null
                          : exp < todayMs
                            ? ("danger" as const)
                            : exp <= soonMs
                              ? ("warn" as const)
                              : null;
                      return (
                        <tr key={b.id}>
                          <td className="px-4 py-2 tabular-nums font-medium">
                            {fmtQty(b.quantityRemaining)} {unit.symbol}
                          </td>
                          <td className="px-4 py-2 tabular-nums text-(--color-muted)">
                            {b.unitCost != null ? fmtMoney(b.unitCost, cur) : "—"}
                          </td>
                          <td className="px-4 py-2 text-(--color-muted)">
                            {fmtDate(b.receivedDate)}
                          </td>
                          <td className="px-4 py-2">
                            {b.expiryDate ? (
                              expTone ? (
                                <Badge tone={expTone}>{fmtDate(b.expiryDate)}</Badge>
                              ) : (
                                fmtDate(b.expiryDate)
                              )
                            ) : (
                              <span className="text-(--color-muted)">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* History */}
          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Stock history
            </div>
            {movements.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-(--color-muted)">
                No movements recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 text-right font-medium">Change</th>
                      <th className="px-4 py-2 text-right font-medium">Cost</th>
                      <th className="px-4 py-2 font-medium">Bill</th>
                      <th className="px-4 py-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {movements.map((m) => {
                      const meta = MOVEMENT_META[m.type];
                      return (
                        <tr key={m.id}>
                          <td className="px-4 py-2">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            {m.note && (
                              <span className="ml-2 text-xs text-(--color-muted)">
                                {m.note}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {meta.sign}
                            {fmtQty(m.quantity)} {m.unitSymbol}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-(--color-muted)">
                            {Number(m.costAmount) > 0 ? fmtMoney(m.costAmount, cur) : "—"}
                          </td>
                          <td className="px-4 py-2">
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
                          <td className="px-4 py-2 text-(--color-muted)">
                            {fmtDate(m.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right: action panel */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6">
            <MovementPanel
              productId={id}
              units={convUnits}
              defaultUnitId={product.stockUnitId}
              events={eventOptions}
              vendors={vendorList.map((v) => ({ id: v.id, name: v.name }))}
              defaultVendorId={product.preferredVendorId}
              lastCostPrice={product.costPrice != null ? Number(product.costPrice) : null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
