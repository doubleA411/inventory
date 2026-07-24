import { requireAuth } from "@/lib/auth";
import { listAllMovements, listCategories } from "@/lib/queries";
import { fmtQty, fmtDate, fmtMoney } from "@/lib/utils";
import { MOVEMENT_META } from "@/lib/labels";
import { ReportView } from "@/components/report";
import { PrintBar } from "../../print-bar";

export default async function StockHistoryReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    category?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { organization } = await requireAuth();
  const cur = organization.currency;
  const sp = await searchParams;
  const [movements, categories] = await Promise.all([
    listAllMovements(organization.id, {
      type: sp.type,
      categoryId: sp.category,
      from: sp.from,
      to: sp.to,
      limit: 5000,
    }),
    listCategories(organization.id),
  ]);

  const meta: { label: string; value: string }[] = [];
  if (sp.from || sp.to)
    meta.push({
      label: "Period",
      value: `${sp.from ? fmtDate(sp.from) : "start"} – ${sp.to ? fmtDate(sp.to) : "today"}`,
    });
  if (sp.type) meta.push({ label: "Type", value: sp.type });
  if (sp.category) {
    const c = categories.find((x) => x.id === sp.category);
    if (c) meta.push({ label: "Category", value: c.name });
  }
  meta.push({ label: "Entries", value: String(movements.length) });

  const totalCost = movements.reduce((s, m) => s + Number(m.costAmount), 0);

  const rows = movements.map((m) => {
    const mm = MOVEMENT_META[m.type];
    return [
      fmtDate(m.createdAt),
      m.productName,
      mm.label,
      `${mm.sign}${fmtQty(m.quantity)} ${m.unitSymbol}`,
      Number(m.costAmount) > 0 ? fmtMoney(m.costAmount, cur) : "—",
      m.invoiceNumber ?? "—",
    ];
  });

  return (
    <div className="print-wrap">
      <PrintBar backHref="/movements" />
      <ReportView
        orgName={organization.legalName || organization.name}
        title="Stock History Report"
        meta={meta}
        columns={[
          { label: "Date" },
          { label: "Product" },
          { label: "Type" },
          { label: "Change", align: "right" },
          { label: "Cost", align: "right" },
          { label: "Bill" },
        ]}
        rows={rows}
        totalRow={["", "", "", "Total cost", fmtMoney(totalCost, cur), ""]}
      />
    </div>
  );
}
