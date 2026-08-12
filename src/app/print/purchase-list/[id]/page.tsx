import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPurchaseListFull } from "@/lib/purchase-list-queries";
import { orgToDocOrg } from "@/components/document-view";
import { PurchaseListView } from "@/components/purchase-list-view";
import { PrintBar } from "../../print-bar";

export default async function PurchaseListPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireAuth();
  const { id } = await params;
  const data = await getPurchaseListFull(organization.id, id);
  if (!data) notFound();
  const { list, items, vendor } = data;

  return (
    <div className="print-wrap">
      <PrintBar backHref={`/purchase-lists/${id}`} />
      <div>
        <PurchaseListView
          org={orgToDocOrg(organization)}
          vendor={vendor}
          list={{
            number: list.number,
            listDate: list.listDate,
            notes: list.notes,
            items: items.map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unit: i.unit,
            })),
          }}
        />
      </div>
    </div>
  );
}
