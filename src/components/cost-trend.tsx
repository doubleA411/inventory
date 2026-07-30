import { ArrowDown, ArrowUp } from "lucide-react";
import { fmtMoney } from "@/lib/utils";
import type { CostTrend } from "@/lib/queries";

/**
 * Purchase-cost movement between a product's last two costed batches.
 *
 * Colour is deliberately inverted from a share-price chart: this is what the
 * business *pays*, so a rise is a warning (red) and a fall is good (green).
 */
export function CostTrendBadge({
  trend,
  currency,
  unitSymbol,
}: {
  trend: CostTrend | null;
  currency: string;
  unitSymbol?: string;
}) {
  if (!trend || trend.direction === "flat") return null;

  const up = trend.direction === "up";
  const Icon = up ? ArrowUp : ArrowDown;
  const tone = up
    ? "bg-(--color-danger-soft) text-(--color-danger)"
    : "bg-(--color-ok-soft) text-(--color-ok)";
  const per = unitSymbol ? `/${unitSymbol}` : "";
  const pct =
    trend.changePct == null ? null : `${up ? "+" : ""}${trend.changePct.toFixed(1)}%`;

  return (
    <span
      className={`ml-2 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 align-middle text-xs font-medium ${tone}`}
      title={`Last purchase ${fmtMoney(trend.latest, currency)}${per} — previous ${fmtMoney(
        trend.previous,
        currency,
      )}${per}${pct ? ` (${pct})` : ""}`}
    >
      <Icon className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
      {pct}
      <span className="sr-only">
        Purchase cost {up ? "increased" : "decreased"} from{" "}
        {fmtMoney(trend.previous, currency)} to {fmtMoney(trend.latest, currency)}
      </span>
    </span>
  );
}
