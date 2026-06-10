import { BarChart, type BarChartData } from "@/components/bar-chart";
import {
  ComparisonCard,
  type ComparisonChartData,
} from "@/components/comparison-card";

/** Any chart payload the chat can attach to an assistant message. */
export type ChartData = BarChartData | ComparisonChartData;

/** Renders the right visualization for a chart payload. */
export function ChatChart({
  chart,
  className,
}: {
  chart: ChartData;
  className?: string;
}) {
  if (chart.type === "comparison") {
    return <ComparisonCard chart={chart} className={className} />;
  }
  return <BarChart chart={chart} className={className} />;
}
