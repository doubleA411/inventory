import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getPurchaseListFull } from "@/lib/purchase-list-queries";
import { listVendors, listProductsForPicker } from "@/lib/purchase-queries";
import { listUnits } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { PurchaseListEditor } from "../../purchase-list-editor";

export default async function EditPurchaseListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireRole("admin");
  const { id } = await params;
  const [data, vendors, products, units] = await Promise.all([
    getPurchaseListFull(organization.id, id),
    listVendors(organization.id),
    listProductsForPicker(organization.id),
    listUnits(organization.id),
  ]);
  if (!data) notFound();
  if (data.list.status !== "draft") notFound();

  return (
    <div>
      <PageHeader title={`Edit ${data.list.number}`} subtitle="Only drafts can be edited." />
      <PurchaseListEditor
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        allProducts={products}
        preferredProducts={[]}
        units={units.map((u) => ({ id: u.id, symbol: u.symbol, groupId: u.groupId }))}
        initial={{
          id: data.list.id,
          vendorId: data.list.vendorId ?? "",
          listDate: data.list.listDate,
          notes: data.list.notes,
          items: data.items.map((i) => ({
            productId: i.productId,
            description: i.description,
            quantity: Number(i.quantity),
            unit: i.unit,
          })),
        }}
      />
    </div>
  );
}
