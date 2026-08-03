import { requireRole } from "@/lib/auth";
import { listVendors, listProductsForPicker } from "@/lib/purchase-queries";
import { listUnits } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PurchaseBillEditor } from "../purchase-bill-editor";

export default async function NewPurchaseBillPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const [vendors, products, units] = await Promise.all([
    listVendors(organization.id),
    listProductsForPicker(organization.id),
    listUnits(organization.id),
  ]);

  return (
    <div>
      <PageHeader title="New purchase bill" subtitle="Record what you bought and from whom." />
      <PurchaseBillEditor
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        products={products}
        units={units.map((u) => ({ id: u.id, symbol: u.symbol, groupId: u.groupId }))}
        currency={organization.currency}
        defaultVendorId={sp.vendorId}
      />
    </div>
  );
}
