import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getQuotationFull, invoiceMoney } from "@/lib/billing-queries";
import { eventExpenseTotal } from "@/lib/expenses";
import { Badge } from "@/components/ui";
import { ProfitabilityCard } from "@/components/profitability-card";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { QUOTE_STATUS_META } from "@/lib/labels";
import { ArrowLeft, Copy, Download, Pencil, Printer, UtensilsCrossed } from "lucide-react";
import { QuoteActions } from "./quote-actions";
import { BookingCard } from "./booking-card";

export default async function QuotationViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization, role } = await requireRole("admin");
  const { id } = await params;
  const data = await getQuotationFull(organization.id, id);
  if (!data) notFound();
  const { quotation, items, customer } = data;
  const cur = organization.currency;
  const meta = QUOTE_STATUS_META[quotation.status];
  const gstEnabled = organization.gstRegistered && quotation.applyGst;
  const approved = !!quotation.approvedAt;
  const isOwner = role === "owner";
  const hasMenu = items.some((i) => i.menuItems?.length);
  // Profitability only means something once the customer has actually
  // committed to this price — a draft/sent estimate hasn't been agreed to
  // yet, and a rejected/expired one never will be billed, so "margin"
  // against either is a number that was never going to be earned.
  const isConverted = quotation.status === "converted";
  const isCommitted = quotation.status === "accepted" || isConverted;
  const expenseSummary = isCommitted
    ? await eventExpenseTotal(organization.id, id)
    : null;
  // Read the invoice's live paid amount rather than the quotation's stored
  // advance: reversing that payment on the invoice has to be visible here too.
  const invoice = quotation.convertedInvoiceId
    ? await invoiceMoney(organization.id, quotation.convertedInvoiceId)
    : null;

  return (
    <div>
      <Link
        href="/quotations"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Quotations
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{quotation.number}</h1>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <div className="mt-1 text-sm text-(--color-muted)">
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="hover:underline">
                {customer.name}
              </Link>
            ) : (
              "Walk-in"
            )}{" "}
            · {fmtDate(quotation.issueDate)}
            {quotation.eventDate ? ` · event on ${fmtDate(quotation.eventDate)}` : ""}
            {quotation.validUntil ? ` · valid until ${fmtDate(quotation.validUntil)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {approved ? (
            <>
              <Link href={`/print/quotation/${id}`} className="btn-outline">
                <Printer className="h-4 w-4" /> Print
              </Link>
              {hasMenu && (
                <Link
                  href={`/print/quotation/${id}?menu=1`}
                  className="btn-outline"
                  title="Dish lists only — no pricing"
                >
                  <UtensilsCrossed className="h-4 w-4" /> Print menu
                </Link>
              )}
              <a href={`/api/documents/quotation/${id}`} className="btn-primary">
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
          {/* A converted quotation is frozen — its invoice is already with the
              customer (see saveQuotationCore). Duplicate is the way to quote a
              changed price, so it is offered in Edit's place rather than
              letting someone walk into a refusal. */}
          {!isConverted && (
            <Link href={`/quotations/${id}/edit`} className="btn-outline">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          <Link
            href={`/quotations/new?cloneFrom=${id}`}
            className="btn-outline"
            title="Start a new quotation pre-filled with this one's details"
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Link>
        </div>
      </div>
      {isConverted && (
        <p className="mb-4 rounded-lg bg-(--color-bg) px-3 py-2 text-sm text-(--color-muted)">
          This quotation has been turned into an invoice, so it can&rsquo;t be changed. Use{" "}
          <strong>Duplicate</strong> to start a new quotation from it.
        </p>
      )}

      <div className="mb-6">
        <QuoteActions
          id={id}
          status={quotation.status}
          convertedInvoiceId={quotation.convertedInvoiceId}
          approved={approved}
          isOwner={isOwner}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
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
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(i.amount, cur)}</td>
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
                    <td className="text-right tabular-nums">{fmtMoney(quotation.subtotal, cur)}</td>
                  </tr>
                  {gstEnabled && (
                    <tr>
                      <td className="pr-8 text-(--color-muted)">Tax</td>
                      <td className="text-right tabular-nums">{fmtMoney(quotation.taxTotal, cur)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-(--color-border)">
                    <td className="pr-8 pt-1 font-semibold">Total</td>
                    <td className="pt-1 text-right text-base font-semibold tabular-nums">
                      {fmtMoney(quotation.total, cur)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {expenseSummary && (
            <ProfitabilityCard
              revenue={Number(quotation.total)}
              cost={expenseSummary.total}
              expenseCount={expenseSummary.count}
              cur={cur}
              expensesHref={`/expenses?quotationId=${id}`}
            />
          )}
        </div>

        <div className="space-y-6">
          <BookingCard
            id={id}
            currency={cur}
            total={invoice?.total ?? quotation.total}
            invoicePaid={invoice?.amountPaid ?? null}
            advanceAmount={quotation.advanceAmount}
            advanceRecordedAt={quotation.advanceRecordedAt}
            takenAt={quotation.takenAt}
            converted={quotation.status === "converted"}
            convertedInvoiceId={quotation.convertedInvoiceId}
          />
        </div>
      </div>
    </div>
  );
}
