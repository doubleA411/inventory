import { notFound } from "next/navigation";
import { getQuotationByShareToken } from "@/lib/sharing";
import { getQuotationFull } from "@/lib/billing-queries";
import { DocumentView, orgToDocOrg } from "@/components/document-view";
import { PrintBar } from "../../../print/print-bar";

// Public — no auth. The token itself is the credential; a revoked or
// never-generated token 404s, same as an unknown id would.
export default async function SharedQuotationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await getQuotationByShareToken(token);
  if (!found || !found.quotation.approvedAt) notFound();
  const { organization } = found;

  const data = await getQuotationFull(organization.id, found.quotation.id);
  if (!data) notFound();
  const { quotation, items, customer } = data;

  const gstEnabled = organization.gstRegistered;
  const intraState =
    !organization.stateCode || quotation.placeOfSupplyStateCode === organization.stateCode;
  const half = (Number(quotation.taxTotal) / 2).toFixed(2);

  return (
    <div className="print-wrap">
      <PrintBar />
      <div>
        <DocumentView
          org={orgToDocOrg(organization)}
          customer={customer}
          doc={{
            kind: "quote",
            title: "QUOTATION",
            number: quotation.number,
            issueDate: quotation.issueDate,
            secondDateLabel: "Valid until",
            secondDate: quotation.validUntil,
            placeOfSupplyStateCode: quotation.placeOfSupplyStateCode,
            gstEnabled,
            intraState,
            items: items.map((i) => ({
              description: i.description,
              hsnSac: i.hsnSac,
              quantity: i.quantity,
              unit: i.unit,
              rate: i.rate,
              taxRate: i.taxRate,
              amount: i.amount,
              menuItems: i.menuItems,
              eventDate: i.eventDate,
            })),
            subtotal: quotation.subtotal,
            cgst: half,
            sgst: half,
            igst: quotation.taxTotal,
            roundOff: "0",
            total: quotation.total,
            notes: quotation.notes,
            terms: quotation.terms,
          }}
        />
      </div>
    </div>
  );
}
