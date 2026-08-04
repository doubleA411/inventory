import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getInvoiceFull } from "@/lib/billing-queries";
import { DocumentView, orgToDocOrg } from "@/components/document-view";
import { PrintBar } from "../../print-bar";

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireAuth();
  const { id } = await params;
  const data = await getInvoiceFull(organization.id, id);
  if (!data) notFound();
  const { invoice, items, customer, payments } = data;
  // Approval gate: can't print until the owner approves.
  if (!invoice.approvedAt) redirect(`/invoices/${id}`);

  const gstEnabled = invoice.docType === "tax_invoice";
  const intraState =
    !organization.stateCode ||
    invoice.placeOfSupplyStateCode === organization.stateCode;

  return (
    <div className="print-wrap">
      <PrintBar backHref={`/invoices/${id}`} />
      <div>
        <DocumentView
          org={orgToDocOrg(organization)}
          customer={customer}
          doc={{
            kind: "invoice",
            title: gstEnabled ? "TAX INVOICE" : "BILL OF SUPPLY",
            number: invoice.number,
            issueDate: invoice.issueDate,
            secondDateLabel: "Due date",
            secondDate: invoice.dueDate,
            placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
            venue: invoice.venue,
            reverseCharge: invoice.reverseCharge,
            gstEnabled,
            intraState,
            items: items.map((i) => ({
              description: i.description,
              hsnSac: i.hsnSac,
              quantity: i.quantity,
              unit: i.unit,
              rate: i.rate,
              taxRate: i.taxRate,
              taxableValue: i.taxableValue,
              amount: i.amount,
              menuItems: i.menuItems,
              eventDate: i.eventDate,
            })),
            subtotal: invoice.subtotal,
            cgst: invoice.cgst,
            sgst: invoice.sgst,
            igst: invoice.igst,
            roundOff: invoice.roundOff,
            total: invoice.total,
            amountPaid: invoice.amountPaid,
            payments: payments.map((p) => ({
              amount: p.amount,
              method: p.method,
              reference: p.reference,
              paidAt: p.paidAt,
            })),
            notes: invoice.notes,
            terms: invoice.terms,
            showMenuList: invoice.showMenuList,
          }}
        />
      </div>
    </div>
  );
}
