import { AreaChart, LineChart } from "heroui-native-pro";
import { formatAmountCompact } from "@/core/shared/util";
import type { SpendingEntity } from "@/core/types/models";
import { CompactChart } from "./CompactChart";

type SpendingGraphProps = {
  data: SpendingEntity;
  mode: "single-month" | "budget" | "average";
};

/**
 * Compact spending comparison — port of desktop-client `SpendingGraph` (compact
 * mode). Cumulative spending for the compare month (filled area) against the
 * comparison series (prior month / average / budget, muted line), by day of
 * month. Amounts are negated so spending reads upward. heroui charts (Skia) so
 * press state stays available. Compact Y axis; exact values live in the card.
 */
export function SpendingGraph({ data, mode }: SpendingGraphProps) {
  const comparisonOf = (d: SpendingEntity["intervalData"][number]) =>
    mode === "average" ? d.average : mode === "budget" ? d.budget : d.compareTo;

  // Carry the last known "this month" value forward past today (cumulative is
  // null for future days) so the area doesn't drop to zero.
  let lastThis = 0;
  const points = data.intervalData.map((d) => {
    const raw = d.compare as number | null;
    const thisMonth = raw == null ? lastThis : (lastThis = -raw);
    return {
      x: d.day === "28" ? "28+" : d.day,
      thisMonth,
      comparison: -(comparisonOf(d) ?? 0),
    };
  });

  return (
    <CompactChart>
      {(size) => (
        <AreaChart
          data={points}
          xKey="x"
          yKeys={["thisMonth", "comparison"]}
          explicitSize={size}
          orientation="vertical"
          yAxis={[{ formatYLabel: (v: string | number) => formatAmountCompact(Number(v)) }]}
        >
          {({ points: pts, chartBounds }) => (
            <>
              <AreaChart.Area
                points={pts.comparison}
                y0={chartBounds.bottom}
                curveType="linear"
                colorClassName="accent-muted"
              />
              <LineChart.Line
                points={pts.comparison}
                curveType="linear"
                colorClassName="accent-muted"
              />
              <AreaChart.Area
                points={pts.thisMonth}
                y0={chartBounds.bottom}
                curveType="linear"
                colorClassName="accent-chart-1"
              />
              <LineChart.Line
                points={pts.thisMonth}
                curveType="linear"
                colorClassName="accent-chart-1"
              />
            </>
          )}
        </AreaChart>
      )}
    </CompactChart>
  );
}
