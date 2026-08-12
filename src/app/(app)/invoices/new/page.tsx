import { requireRole } from "@/lib/auth";
import { listCustomers } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { saveInvoice } from "../actions";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const { organization: o } = await requireRole("admin");
  const { customerId } = await searchParams;
  const customers = await listCustomers(o.id);

  return (
    <div>
      <PageHeader
        title="New invoice"
        subtitle={o.gstRegistered ? "GST tax invoice" : "Bill of supply (not GST-registered)"}
      />
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
        initial={customerId ? { customerId } : undefined}
        save={saveInvoice}
      />
    </div>
  );
}
