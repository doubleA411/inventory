import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  getCustomer,
  listInvoicesForCustomer,
  listQuotationsForCustomer,
  listPaymentsForCustomer,
  displayInvoiceStatus,
} from "@/lib/billing-queries";
import { normalizeIndianMobile, waLink } from "@/lib/sharing";
import { PageHeader, Badge } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/utils";
import { INVOICE_STATUS_META, QUOTE_STATUS_META } from "@/lib/labels";
import { ArrowLeft, FileText, MessageCircle, Plus } from "lucide-react";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const [customer, invoices, quotations, paymentRows] = await Promise.all([
    getCustomer(organization.id, id),
    listInvoicesForCustomer(organization.id, id),
    listQuotationsForCustomer(organization.id, id),
    listPaymentsForCustomer(organization.id, id),
  ]);
  if (!customer) notFound();
  const cur = organization.currency;

  const activeInvoices = invoices.filter((i) => i.status !== "cancelled");
  const billed = activeInvoices.reduce((s, i) => s + Number(i.total), 0);
  const paid = activeInvoices.reduce((s, i) => s + Number(i.amountPaid), 0);
  const due = billed - paid;

  const waPhone = normalizeIndianMobile(customer.phone);

  return (
    <div>
      <Link
        href="/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-(--color-muted) hover:text-(--color-fg)"
      >
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      <PageHeader
        title={customer.name}
        subtitle={[customer.location, customer.district].filter(Boolean).join(", ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href={`/quotations/new?customerId=${customer.id}`} className="btn-outline">
              <FileText className="h-4 w-4" /> New quotation
            </Link>
            <Link href={`/invoices/new?customerId=${customer.id}`} className="btn-primary">
              <Plus className="h-4 w-4" /> New invoice
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-(--color-muted)">Billed</div>
                <div className="font-semibold tabular-nums">{fmtMoney(billed, cur)}</div>
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

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Invoices
            </div>
            {invoices.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No invoices yet for this customer.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Invoice</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 text-right font-medium">Due</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {invoices.map((inv) => {
                      const invDue = Number(inv.total) - Number(inv.amountPaid);
                      const st = displayInvoiceStatus(inv);
                      const meta = INVOICE_STATUS_META[st];
                      return (
                        <tr key={inv.id} className="hover:bg-(--color-bg)">
                          <td className="px-4 py-2.5">
                            <Link href={`/invoices/${inv.id}`} className="font-medium hover:underline">
                              {inv.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(inv.issueDate)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(inv.total, cur)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {inv.status !== "cancelled" && invDue > 0 ? fmtMoney(invDue, cur) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Quotations
            </div>
            {quotations.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No quotations yet for this customer.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Quotation</th>
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {quotations.map((q) => {
                      const meta = QUOTE_STATUS_META[q.status];
                      return (
                        <tr key={q.id} className="hover:bg-(--color-bg)">
                          <td className="px-4 py-2.5">
                            <Link href={`/quotations/${q.id}`} className="font-medium hover:underline">
                              {q.number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(q.issueDate)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(q.total, cur)}</td>
                          <td className="px-4 py-2.5">
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              Payment history
            </div>
            {paymentRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-(--color-muted)">
                No payments recorded yet. Record a payment from an invoice to see it here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                      <th className="px-4 py-2 font-medium">Date paid</th>
                      <th className="px-4 py-2 text-right font-medium">Amount</th>
                      <th className="px-4 py-2 font-medium">Invoice</th>
                      <th className="px-4 py-2 font-medium">Method</th>
                      <th className="px-4 py-2 font-medium">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--color-border)">
                    {paymentRows.map((p) => (
                      <tr key={p.id} className="hover:bg-(--color-bg)">
                        <td className="px-4 py-2.5 text-(--color-muted)">{fmtDate(p.paidAt)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                          {fmtMoney(p.amount, cur)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/invoices/${p.invoiceId}`} className="hover:underline">
                            {p.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-(--color-muted) capitalize">
                          {p.method.replace("_", " ")}
                        </td>
                        <td className="px-4 py-2.5 text-(--color-muted)">{p.reference || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card space-y-2 p-4 text-sm">
          <div className="font-semibold">Customer details</div>
          <div className="text-(--color-muted)">GSTIN: {customer.gstin || "—"}</div>
          <div className="text-(--color-muted)">Address: {customer.addressLine || "—"}</div>
          <div className="text-(--color-muted)">PIN: {customer.pincode || "—"}</div>
          <div className="text-(--color-muted)">Ph: {customer.phone || "—"}</div>
          <div className="text-(--color-muted)">Email: {customer.email || "—"}</div>
          <div className="text-(--color-muted)">Notes: {customer.notes || "—"}</div>
          {waPhone && (
            <a
              href={waLink(waPhone, `Hi ${customer.name}, this is ${organization.name}.`)}
              target="_blank"
              rel="noreferrer"
              className="btn-outline mt-2 w-full"
            >
              <MessageCircle className="h-4 w-4" /> Message on WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
