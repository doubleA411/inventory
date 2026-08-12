import { requireRole } from "@/lib/auth";
import { listVendors, listProductsForPicker } from "@/lib/purchase-queries";
import { listPreferredProductsForVendor } from "@/lib/purchase-list-queries";
import { listUnits } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PurchaseListEditor } from "../purchase-list-editor";

export default async function NewPurchaseListPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const [vendors, products, units, preferredProducts] = await Promise.all([
    listVendors(organization.id),
    listProductsForPicker(organization.id),
    listUnits(organization.id),
    sp.vendorId ? listPreferredProductsForVendor(organization.id, sp.vendorId) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="New purchase list"
        subtitle="Pick what to ask this vendor to supply, then download it as a PDF to send them."
      />
      <PurchaseListEditor
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        allProducts={products}
        preferredProducts={preferredProducts}
        units={units.map((u) => ({ id: u.id, symbol: u.symbol, groupId: u.groupId }))}
        defaultVendorId={sp.vendorId}
      />
    </div>
  );
}
