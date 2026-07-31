import { requireRole } from "@/lib/auth";
import { getExpenseLedger, groupLedgerByDate, listExpenseCategories } from "@/lib/expenses";
import { listQuotationsForPicker } from "@/lib/billing-queries";
import { PageHeader } from "@/components/ui";
import { fmtMoney } from "@/lib/utils";
import { ExpenseFilters } from "./expense-filters";
import { ExpensesBoard } from "./expenses-board";

function firstOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    category?: string;
    quotationId?: string;
    search?: string;
  }>;
}) {
  const { organization } = await requireRole("admin");
  const sp = await searchParams;
  const from = sp.from || firstOfMonth();
  const to = sp.to || today();
  const cur = organization.currency;

  const [categories, quotations, rows] = await Promise.all([
    listExpenseCategories(organization.id),
    listQuotationsForPicker(organization.id),
    getExpenseLedger(organization.id, {
      from,
      to,
      category: sp.category,
      quotationId: sp.quotationId,
      search: sp.search,
    }),
  ]);

  const days = groupLedgerByDate(rows);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const stockTotal = rows.filter((r) => r.source === "stock").reduce((s, r) => s + r.amount, 0);
  const otherTotal = total - stockTotal;

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Stock usage combined with labor, rentals and every other cost, by date and category."
      />

      <ExpenseFilters
        categories={categories}
        quotations={quotations}
        from={from}
        to={to}
        category={sp.category}
        quotationId={sp.quotationId}
        search={sp.search}
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-(--color-muted)">Total ({days.length || 0} days)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(total, cur)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-(--color-muted)">Stock usage</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(stockTotal, cur)}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-(--color-muted)">Other expenses</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(otherTotal, cur)}</div>
        </div>
      </div>

      <ExpensesBoard
        categories={categories}
        quotations={quotations}
        days={days}
        total={total}
        cur={cur}
      />
    </div>
  );
}
