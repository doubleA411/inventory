import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getInvoiceFull, displayInvoiceStatus } from "@/lib/billing-queries";
import { eventExpenseTotal } from "@/lib/expenses";
import { Badge } from "@/components/ui";
import { ProfitabilityCard } from "@/components/profitability-card";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { amountInWords } from "@/lib/tax";
import { INVOICE_STATUS_META } from "@/lib/labels";
import { ArrowLeft, Download, Pencil, Printer } from "lucide-react";
import { invoiceActivity } from "@/lib/activity";
import { PaymentForm } from "./payment-form";
import { InvoicePaymentHistory } from "./payment-history";
import { InvoiceActions } from "./invoice-actions";

export default async function InvoiceViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization, role } = await requireRole("admin");
  const { id } = await params;
  const data = await getInvoiceFull(organization.id, id);
  if (!data) notFound();
  const { invoice, items, customer, payments } = data;
  const expenseSummary = invoice.quotationId
    ? await eventExpenseTotal(organization.id, invoice.quotationId)
    : { total: 0, count: 0 };
  const activity = await invoiceActivity(organization.id, id);
  const cur = organization.currency;
  const approved = !!invoice.approvedAt;
  const isOwner = role === "owner";

  const st = displayInvoiceStatus(invoice);
  const meta = INVOICE_STATUS_META[st];
  const paid = Number(invoice.amountPaid);
  const total = Number(invoice.total);
  const due = total - paid;
  const gstEnabled = invoice.docType === "tax_invoice";
  const intraState =
    !organization.stateCode || invoice.placeOfSupplyStateCode === organization.stateCode;

  return (
    <div>
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Invoices
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">
            {gstEnabled ? "Tax Invoice" : "Bill of Supply"} ·{" "}
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            ) : (
              "Walk-in"
            )}{" "}
            · {fmtDate(invoice.issueDate)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approved ? (
            <>
              <Link href={`/print/invoice/${id}`} className="btn-outline">
                <Printer className="h-4 w-4" /> Print
              </Link>
              <a href={`/api/documents/invoice/${id}`} className="btn-primary">
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </>
          ) : (
            // Says the reason in the page instead of hiding it in a hover
            // tooltip that a phone never shows.
            <span className="inline-flex items-center gap-2 rounded-lg bg-(--color-bg) px-3 py-2 text-sm text-(--color-muted)">
              <Download className="h-4 w-4" /> PDF after the owner approves
            </span>
          )}
          <Link href={`/invoices/${id}/edit`} className="btn-outline">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
          <InvoiceActions
            id={id}
            status={invoice.status}
            approved={approved}
            isOwner={isOwner}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Items + totals */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Rate</th>
                    {gstEnabled && <th className="px-4 py-2 text-right font-medium">Tax%</th>}
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2">
                        {i.description}
                        {i.hsnSac && (
                          <span className="ml-2 text-xs text-(--color-muted)">{i.hsnSac}</span>
                        )}
                        {!!i.menuItems?.length && (
                          <div className="mt-1.5 rounded-md bg-(--color-bg) p-2">
                            {i.eventDate && (
                              <div className="mb-1 text-xs font-medium text-(--color-muted)">
                                {fmtDate(i.eventDate)}
                              </div>
                            )}
                            <ol className="list-decimal space-y-0.5 pl-4 text-xs text-(--color-muted)">
                              {i.menuItems.map((m, mi) => (
                                <li key={mi}>{m}</li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {Number(i.quantity)} {i.unit ?? ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(i.rate, cur)}</td>
                      {gstEnabled && (
                        <td className="px-4 py-2 text-right tabular-nums">{Number(i.taxRate)}%</td>
                      )}
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmtMoney(i.taxableValue, cur)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-(--color-border) p-4">
              <table className="text-sm">
                <tbody>
                  <tr>
                    <td className="pr-8 text-(--color-muted)">Subtotal</td>
                    <td className="text-right tabular-nums">{fmtMoney(invoice.subtotal, cur)}</td>
                  </tr>
                  {gstEnabled && intraState && (
                    <>
                      <tr>
                        <td className="pr-8 text-(--color-muted)">CGST</td>
                        <td className="text-right tabular-nums">{fmtMoney(invoice.cgst, cur)}</td>
                      </tr>
                      <tr>
                        <td className="pr-8 text-(--color-muted)">SGST</td>
                        <td className="text-right tabular-nums">{fmtMoney(invoice.sgst, cur)}</td>
                      </tr>
                    </>
                  )}
                  {gstEnabled && !intraState && (
                    <tr>
                      <td className="pr-8 text-(--color-muted)">IGST</td>
                      <td className="text-right tabular-nums">{fmtMoney(invoice.igst, cur)}</td>
                    </tr>
                  )}
                  {Number(invoice.roundOff) !== 0 && (
                    <tr>
                      <td className="pr-8 text-(--color-muted)">Round off</td>
                      <td className="text-right tabular-nums">{fmtMoney(invoice.roundOff, cur)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-(--color-border)">
                    <td className="pr-8 pt-1 font-semibold">Total</td>
                    <td className="pt-1 text-right text-base font-semibold tabular-nums">
                      {fmtMoney(invoice.total, cur)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-sm text-(--color-muted)">
            <span className="font-medium text-(--color-fg)">In words:</span>{" "}
            {amountInWords(total)}
          </p>

          <ProfitabilityCard
            revenue={total}
            cost={expenseSummary.total}
            expenseCount={expenseSummary.count}
            cur={cur}
            expensesHref={
              invoice.quotationId ? `/expenses?quotationId=${invoice.quotationId}` : "/expenses"
            }
          />
        </div>

        {/* Payments */}
        <div className="space-y-6">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-(--color-muted)">Total</div>
                <div className="font-semibold tabular-nums">{fmtMoney(total, cur)}</div>
              </div>
              <div>
                <div className="text-xs text-(--color-muted)">Paid</div>
                <div className="font-semibold tabular-nums text-(--color-ok)">
                  {fmtMoney(paid, cur)}
                </div>
              </div>
              <div>
                <div className="text-xs text-(--color-muted)">Due</div>
                <div className="font-semibold tabular-nums text-(--color-danger)">
                  {fmtMoney(due, cur)}
                </div>
              </div>
            </div>
          </div>

          {invoice.status !== "cancelled" &&
            (due > 0 ? (
              <div className="card p-4">
                <div className="mb-3 text-sm font-semibold">Record a payment</div>
                <PaymentForm invoiceId={id} due={due} currency={cur} />
              </div>
            ) : (
              // Says why there's no form rather than just omitting it — a
              // vanished form reads as a bug, especially after an overpayment.
              <div className="card p-4 text-sm text-(--color-muted)">
                {due < 0
                  ? `This bill has been overpaid by ${fmtMoney(-due, cur)}. Reverse a payment below to correct it.`
                  : "This bill is fully paid — nothing left to collect."}
              </div>
            ))}

          <div className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment history
            </div>
            <InvoicePaymentHistory invoiceId={id} currency={cur} payments={payments} />
            {activity.length > 0 && (
              // Reversals delete the payment row, so without this the money
              // would leave the books with no trace of who removed it.
              <div className="border-t border-(--color-border) px-4 py-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-(--color-muted)">
                  Changes to payments
                </div>
                <ul className="space-y-1.5">
                  {activity.map((a) => (
                    <li key={a.id} className="text-xs text-(--color-muted)">
                      {a.summary} — {a.userName ?? "a removed user"} on{" "}
                      {fmtDate(a.createdAt.toISOString())}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
