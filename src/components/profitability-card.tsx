import Link from "next/link";
import { fmtMoney } from "@/lib/utils";

/**
 * Revenue vs. cost for one event — cost already combines ingredient (stock
 * usage) cost and manual expenses via eventExpenseTotal(), so this is just
 * the subtraction, not a second data source.
 */
export function ProfitabilityCard({
  revenue,
  cost,
  expenseCount,
  cur,
  expensesHref,
}: {
  revenue: number;
  cost: number;
  expenseCount: number;
  cur: string;
  expensesHref: string;
}) {
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;
  const positive = margin >= 0;

  return (
    <div className="card mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Profitability</h2>
        {expenseCount > 0 ? (
          <Link
            href={expensesHref}
            className="text-xs text-(--color-primary) hover:underline"
          >
            View {expenseCount} expense{expenseCount === 1 ? "" : "s"}
          </Link>
        ) : (
          <Link href={expensesHref} className="text-xs text-(--color-muted) hover:underline">
            No expenses logged yet
          </Link>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-(--color-muted)">Revenue</div>
          <div className="mt-1 font-semibold tabular-nums">{fmtMoney(revenue, cur)}</div>
        </div>
        <div>
          <div className="text-xs text-(--color-muted)">Cost</div>
          <div className="mt-1 font-semibold tabular-nums">{fmtMoney(cost, cur)}</div>
        </div>
        <div>
          <div className="text-xs text-(--color-muted)">Margin</div>
          <div
            className={`mt-1 font-semibold tabular-nums ${
              positive ? "text-(--color-ok)" : "text-(--color-danger)"
            }`}
          >
            {fmtMoney(margin, cur)}
            {marginPct != null && ` (${marginPct.toFixed(0)}%)`}
          </div>
        </div>
      </div>
    </div>
  );
}
