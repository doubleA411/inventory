import { requireRole } from "@/lib/auth";
import { listCustomers } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { CustomerManager } from "./customer-manager";

export default async function CustomersPage() {
  const { organization } = await requireRole("admin");
  const customers = await listCustomers(organization.id);

  return (
    <div>
      <PageHeader title="Customers" subtitle="Your clients for quotations and invoices." />
      <CustomerManager
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          gstin: c.gstin,
          city: c.city,
          stateCode: c.stateCode,
          phone: c.phone,
          email: c.email,
        }))}
      />
    </div>
  );
}
