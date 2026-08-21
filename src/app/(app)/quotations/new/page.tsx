import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listCustomers, getQuotationFull } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { DocEditor, type DocEditorInitial } from "@/components/doc-editor";
import { saveQuotation } from "../actions";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; cloneFrom?: string }>;
}) {
  const { organization: o } = await requireRole("admin");
  const { customerId, cloneFrom } = await searchParams;
  const customers = await listCustomers(o.id);

  let initial: DocEditorInitial | undefined = customerId ? { customerId } : undefined;
  let subtitle = "Tariff estimate for a customer";
  if (cloneFrom) {
    const source = await getQuotationFull(o.id, cloneFrom);
    if (!source) notFound();
    // A fresh quotation, not a continuation of the source's lifecycle — no
    // id (so this saves as a new row), and none of the source's own
    // status/approval/booking state carries over. Every date is left out so
    // they default the normal way instead of copying stale ones: issueDate
    // and validUntil for the obvious reason, and eventDate because a
    // duplicate is nearly always a *different* function — carrying it over
    // seeds a second booking on a date that is already taken, and both then
    // show up on the dashboard. Everything that actually describes the
    // estimate — customer, venue, items, menu, pricing, GST choice — copies
    // over for editing.
    const { quotation, items } = source;
    initial = {
      customerId: quotation.customerId,
      venue: quotation.venue,
      notes: quotation.notes,
      terms: quotation.terms,
      applyGst: quotation.applyGst,
      items: items.map((i) => ({
        description: i.description,
        hsnSac: i.hsnSac,
        quantity: i.quantity,
        unit: i.unit,
        rate: i.rate,
        taxRate: i.taxRate,
        menuItems: i.menuItems,
      })),
    };
    subtitle = `Cloned from ${quotation.number} — set the event date and check the details`;
  }

  return (
    <div>
      <PageHeader title="New quotation" subtitle={subtitle} />
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
        initial={initial}
        save={saveQuotation}
      />
    </div>
  );
}
