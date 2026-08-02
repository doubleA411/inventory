import { notFound } from "next/navigation";
import { getInvoiceByShareToken } from "@/lib/sharing";
import { getInvoiceFull } from "@/lib/billing-queries";
import { DocumentView, orgToDocOrg } from "@/components/document-view";
import { PrintBar } from "../../../print/print-bar";

// Public — no auth. The token itself is the credential; a revoked or
// never-generated token 404s, same as an unknown id would.
export default async function SharedInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await getInvoiceByShareToken(token);
  if (!found || !found.invoice.approvedAt) notFound();
  const { organization } = found;

  const data = await getInvoiceFull(organization.id, found.invoice.id);
  if (!data) notFound();
  const { invoice, items, customer, payments } = data;

  const gstEnabled = invoice.docType === "tax_invoice";
  const intraState =
    !organization.stateCode || invoice.placeOfSupplyStateCode === organization.stateCode;

  return (
    <div className="print-wrap">
      <PrintBar />
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
          }}
        />
      </div>
    </div>
  );
}
