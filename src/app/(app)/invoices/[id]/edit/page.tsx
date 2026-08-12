import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getInvoiceFull, listCustomers } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { saveInvoice } from "../../actions";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization: o } = await requireRole("admin");
  const { id } = await params;
  const [data, customers] = await Promise.all([
    getInvoiceFull(o.id, id),
    listCustomers(o.id),
  ]);
  if (!data) notFound();
  const { invoice, items } = data;

  return (
    <div>
      <PageHeader title={`Edit ${invoice.number}`} />
      <DocEditor
        kind="invoice"
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
        save={saveInvoice}
        initial={{
          id: invoice.id,
          customerId: invoice.customerId,
          issueDate: invoice.issueDate,
          secondDate: invoice.dueDate,
          venue: invoice.venue,
          notes: invoice.notes,
          terms: invoice.terms,
          applyGst: invoice.docType === "tax_invoice",
          showMenuList: invoice.showMenuList,
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
