import { cn } from "@/lib/utils";

export interface ChartData {
  type: "bar";
  title: string;
  unit: "qty" | "currency";
  data: { label: string; value: number }[];
}

function fmt(value: number, unit: ChartData["unit"]) {
  if (unit === "currency")
    return "$" + value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return value.toLocaleString();
}

/** Dependency-free horizontal bar chart, theme-aware. */
export function BarChart({
  chart,
  className,
}: {
  chart: ChartData;
  className?: string;
}) {
  const max = Math.max(...chart.data.map((d) => d.value), 1);
  return (
    <div
      className={cn(
        "mt-3 rounded-lg border border-border bg-background/50 p-3",
        className
      )}
    >
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {chart.title}
      </p>
      <div className="flex flex-col gap-1.5">
        {chart.data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="w-28 shrink-0 truncate text-muted-foreground"
              title={d.label}
            >
              {d.label}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded bg-primary"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right font-medium tabular-nums">
              {fmt(d.value, chart.unit)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
