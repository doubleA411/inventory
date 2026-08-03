import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getPurchaseBillFull } from "@/lib/purchase-queries";
import { orgToDocOrg } from "@/components/document-view";
import { PurchaseBillView } from "@/components/purchase-bill-view";
import { PrintBar } from "../../print-bar";

export default async function PurchaseBillPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { organization } = await requireAuth();
  const { id } = await params;
  const data = await getPurchaseBillFull(organization.id, id);
  if (!data) notFound();
  const { bill, items, vendor, payments } = data;

  return (
    <div className="print-wrap">
      <PrintBar backHref={`/purchase-bills/${id}`} />
      <div>
        <PurchaseBillView
          org={orgToDocOrg(organization)}
          vendor={vendor}
          bill={{
            number: bill.number,
            billDate: bill.billDate,
            total: bill.total,
            amountPaid: bill.amountPaid,
            notes: bill.notes,
            items: items.map((i) => ({
              description: i.description,
              productId: i.productId,
              quantity: i.quantity,
              unit: i.unit,
              rate: i.rate,
              amount: i.amount,
            })),
            payments: payments.map((p) => ({
              amount: p.amount,
              method: p.method,
              reference: p.reference,
              paidAt: p.paidAt,
            })),
          }}
        />
      </div>
    </div>
  );
}
