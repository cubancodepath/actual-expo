import { ComposedChart } from "heroui-native-pro";
import * as monthUtils from "@/core/shared/monthUtils";
import { formatAmountCompact } from "@/core/shared/util";
import type { BudgetAnalysisData } from "../../data/spreadsheets/budget-analysis-spreadsheet";
import { CompactChart } from "./CompactChart";

type BudgetAnalysisGraphProps = {
  data: BudgetAnalysisData;
};

/**
 * Compact budget-analysis chart — port of desktop-client `BudgetAnalysisGraph`
 * (Bar mode). Per month, three grouped bars — budgeted up (green), spent down
 * (red, kept negative), and the overspending adjustment (amber) — plus the
 * running balance as a gray trend line, on a heroui `ComposedChart`. Compact Y
 * axis.
 */
export function BudgetAnalysisGraph({ data }: BudgetAnalysisGraphProps) {
  const points = data.intervalData.map((d) => ({
    x: monthUtils.format(d.date, "MMM"),
    budgeted: d.budgeted,
    spent: d.spent, // already negative → bar extends below zero
    adjustment: d.overspendingAdjustment, // already a positive magnitude
    balance: d.balance,
  }));
  const vals = points.flatMap((p) => [p.budgeted, p.spent, p.adjustment, p.balance]);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const tickValues = points.map((_, i) => i);

  return (
    <CompactChart>
      {(size) => (
        <ComposedChart
          data={points}
          xKey="x"
          yKeys={["budgeted", "spent", "adjustment", "balance"]}
          explicitSize={size}
          orientation="vertical"
          domain={{ y: [min, max] }}
          xAxis={{ tickValues }}
          yAxis={[{ formatYLabel: (v: string | number) => formatAmountCompact(Number(v)) }]}
        >
          {({ points: pts, chartBounds }) => (
            <>
              <ComposedChart.BarGroup
                chartBounds={chartBounds}
                barWidth={6}
                roundedCorners={{ topLeft: 3, topRight: 3 }}
              >
                <ComposedChart.BarGroupItem
                  points={pts.budgeted}
                  colorClassName="accent-positive"
                />
                <ComposedChart.BarGroupItem points={pts.spent} colorClassName="accent-danger" />
                <ComposedChart.BarGroupItem
                  points={pts.adjustment}
                  colorClassName="accent-warning"
                />
              </ComposedChart.BarGroup>
              <ComposedChart.Line
                points={pts.balance}
                curveType="monotoneX"
                colorClassName="accent-muted"
                strokeWidth={2}
              />
            </>
          )}
        </ComposedChart>
      )}
    </CompactChart>
  );
}
