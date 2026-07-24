import { requireAuth } from "@/lib/auth";
import { listProducts } from "@/lib/queries";
import { fmtQty } from "@/lib/utils";
import { ReportView } from "@/components/report";
import { PrintBar } from "../../print-bar";

export default async function ProductsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const { organization } = await requireAuth();
  const sp = await searchParams;
  const onlyLow = sp.filter === "low";
  const products = await listProducts(organization.id, {
    search: sp.search,
    onlyLow,
  });

  const meta: { label: string; value: string }[] = [
    { label: "Items", value: String(products.length) },
  ];
  if (sp.search) meta.push({ label: "Search", value: sp.search });
  if (onlyLow) meta.push({ label: "Filter", value: "Low stock only" });

  const rows = products.map((p, i) => [
    i + 1,
    p.name,
    p.code ?? "—",
    p.categoryName ?? "—",
    `${fmtQty(p.currentStock)} ${p.unitSymbol}`,
    `${fmtQty(p.reorderLevel)} ${p.unitSymbol}`,
    p.currentStock <= 0 ? "Out of stock" : p.currentStock <= p.reorderLevel ? "Low" : "OK",
  ]);

  return (
    <div className="print-wrap">
      <PrintBar backHref="/products" />
      <ReportView
        orgName={organization.legalName || organization.name}
        title="Products / Inventory Report"
        meta={meta}
        columns={[
          { label: "#" },
          { label: "Product" },
          { label: "Code" },
          { label: "Category" },
          { label: "In stock", align: "right" },
          { label: "Reorder at", align: "right" },
          { label: "Status" },
        ]}
        rows={rows}
      />
    </div>
  );
}
