import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { listVendors, listProductsForPicker } from "@/lib/purchase-queries";
import { getPurchaseListFull } from "@/lib/purchase-list-queries";
import { listUnits } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PurchaseBillEditor } from "../purchase-bill-editor";

export default async function NewPurchaseBillPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; purchaseListId?: string }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const purchaseListId = sp.purchaseListId;
  if (
    purchaseListId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      purchaseListId,
    )
  ) {
    notFound();
  }

  const [vendors, products, units, sourceList] = await Promise.all([
    listVendors(organization.id),
    listProductsForPicker(organization.id),
    listUnits(organization.id),
    purchaseListId ? getPurchaseListFull(organization.id, purchaseListId) : Promise.resolve(null),
  ]);
  if (purchaseListId && !sourceList) notFound();

  const initial = sourceList
    ? {
        vendorId: sourceList.list.vendorId ?? "",
        notes: `Received against purchase list ${sourceList.list.number}`,
        sourceListId: sourceList.list.id,
        sourceListNumber: sourceList.list.number,
        items: sourceList.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
      }
    : undefined;

  return (
    <div>
      <PageHeader
        title="New purchase bill"
        subtitle={
          sourceList
            ? `Confirm what arrived from ${sourceList.vendor?.name ?? "the vendor"}, then enter the actual rates.`
            : "Record what you bought and from whom."
        }
      />
      <PurchaseBillEditor
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        products={products}
        units={units.map((u) => ({ id: u.id, symbol: u.symbol, name: u.name, groupId: u.groupId }))}
        currency={organization.currency}
        defaultVendorId={initial?.vendorId || sp.vendorId}
        initial={initial}
      />
    </div>
  );
}
