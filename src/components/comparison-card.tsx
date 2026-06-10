import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComparisonChartData {
  type: "comparison";
  title: string;
  current: { label: string };
  baseline: { label: string };
  metrics: {
    key: string;
    label: string;
    unit: "currency" | "number";
    current: number;
    baseline: number;
    deltaPct: number;
    goodWhenUp: boolean;
  }[];
}

function fmt(value: number, unit: "currency" | "number") {
  if (unit === "currency")
    return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString();
}

/** Side-by-side period comparison with directional delta badges. */
export function ComparisonCard({
  chart,
  className,
}: {
  chart: ComparisonChartData;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-lg border border-border bg-background/50",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-xs">
        <span className="font-medium text-muted-foreground">{chart.title}</span>
        <span className="text-muted-foreground">
          <span className="text-foreground">{chart.current.label}</span> vs{" "}
          {chart.baseline.label}
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {chart.metrics.map((m) => {
          const up = m.deltaPct > 0.05;
          const down = m.deltaPct < -0.05;
          const good = up ? m.goodWhenUp : down ? !m.goodWhenUp : null;
          const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
          return (
            <li
              key={m.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{m.label}</span>
              <span className="text-right tabular-nums">
                <span className="font-medium">{fmt(m.current, m.unit)}</span>
                <span className="ml-1 text-xs text-muted-foreground">
                  from {fmt(m.baseline, m.unit)}
                </span>
              </span>
              <span
                className={cn(
                  "flex w-20 items-center justify-end gap-0.5 text-xs font-medium tabular-nums",
                  good === true && "text-emerald-600 dark:text-emerald-400",
                  good === false && "text-destructive",
                  good === null && "text-muted-foreground"
                )}
              >
                <Icon className="size-3" />
                {m.deltaPct > 0 ? "+" : ""}
                {m.deltaPct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
