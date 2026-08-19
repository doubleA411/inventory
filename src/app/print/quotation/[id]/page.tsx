import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getQuotationFull } from "@/lib/billing-queries";
import { DocumentView, orgToDocOrg } from "@/components/document-view";
import { PrintBar } from "../../print-bar";

export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ menu?: string }>;
}) {
  const { organization } = await requireAuth();
  const { id } = await params;
  const { menu } = await searchParams;
  const menuOnly = menu === "1";
  const data = await getQuotationFull(organization.id, id);
  if (!data) notFound();
  const { quotation, items, customer } = data;
  // Approval gate: can't print until the owner approves.
  if (!quotation.approvedAt) redirect(`/quotations/${id}`);

  const gstEnabled = organization.gstRegistered && quotation.applyGst;
  const intraState =
    !organization.stateCode ||
    quotation.placeOfSupplyStateCode === organization.stateCode;
  // Split the stored tax total for display.
  const half = (Number(quotation.taxTotal) / 2).toFixed(2);

  return (
    <div className="print-wrap">
      <PrintBar backHref={`/quotations/${id}`} />
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
            venue: quotation.venue,
            gstEnabled,
            intraState,
            menuOnly,
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
