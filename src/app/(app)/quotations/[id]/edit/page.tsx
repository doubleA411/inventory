import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getQuotationFull, listCustomers } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { saveQuotation } from "../../actions";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization: o } = await requireRole("admin");
  const { id } = await params;
  const [data, customers] = await Promise.all([
    getQuotationFull(o.id, id),
    listCustomers(o.id),
  ]);
  if (!data) notFound();
  const { quotation, items } = data;

  return (
    <div>
      <PageHeader title={`Edit ${quotation.number}`} />
      <DocEditor
        kind="quote"
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          stateCode: c.stateCode,
          gstin: c.gstin,
          district: c.district,
          location: c.location,
          email: c.email,
        }))}
        orgStateCode={o.stateCode}
        gstEnabled={o.gstRegistered}
        defaultTaxRate={o.defaultTaxRate}
        defaultSac={o.defaultSac}
        defaultTerms={o.defaultTerms}
        currency={o.currency}
        save={saveQuotation}
        initial={{
          id: quotation.id,
          customerId: quotation.customerId,
          issueDate: quotation.issueDate,
          secondDate: quotation.validUntil,
          venue: quotation.venue,
          notes: quotation.notes,
          terms: quotation.terms,
          items: items.map((i) => ({
            description: i.description,
            hsnSac: i.hsnSac,
            quantity: i.quantity,
            unit: i.unit,
            rate: i.rate,
            taxRate: i.taxRate,
            menuItems: i.menuItems,
            eventDate: i.eventDate,
          })),
        }}
      />
    </div>
  );
}
