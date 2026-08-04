import { requireRole } from "@/lib/auth";
import { listVendors, vendorsSummary } from "@/lib/purchase-queries";
import { PageHeader, StatCard } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { VendorManager } from "./vendor-manager";

export default async function VendorsPage() {
  const { organization } = await requireRole("admin");
  const [vendors, summary] = await Promise.all([
    listVendors(organization.id),
    vendorsSummary(organization.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Vendors"
        subtitle="Suppliers you buy stock from — track what's owed and what's been paid."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Vendors" value={vendors.length} />
        <StatCard
          label="Total due"
          value={fmtMoney(summary.due, organization.currency)}
          tone={summary.due > 0 ? "warn" : "default"}
        />
      </div>

      <VendorManager
        vendors={vendors.map((v) => ({
          id: v.id,
          name: v.name,
          phone: v.phone,
          district: v.district,
          location: v.location,
          openingBalance: v.openingBalance,
          purchased: v.purchased,
          paid: v.paid,
        }))}
        currency={organization.currency}
      />
    </div>
  );
}
