import { BarChart } from "heroui-native-pro";
import { formatAmountCompact } from "@/core/shared/util";
import { CompactChart } from "./CompactChart";

type CashFlowGraphProps = {
  /** Income total (positive cents). */
  income: number;
  /** Expenses as a positive magnitude (cents); upstream negates the raw sum. */
  expenses: number;
};

const BAR_WIDTH = 28;
/** Minimum gap between the income/expense pair, in px. */
const BAR_GAP = 6;

/**
 * Compact cash-flow visual — port of desktop-client `CashFlowCard`'s two-bar
 * chart, on heroui-native-pro `BarChart` (victory-native + Skia, so chart-level
 * press state / tooltips stay available later). Income (green) and expenses
 * (red) as an ADJACENT pair, both plotted as positive magnitudes so the taller
 * bar reads as the larger flow.
 *
 * A single-category `BarGroup` otherwise spreads the pair across the whole band
 * (`gapWidth = groupWidth − 2·barWidth`, and `groupWidth ≈ innerWidth` when
 * `betweenGroupPadding` is the 0.25 default). We instead derive
 * `betweenGroupPadding` from the real `chartBounds` so the group is exactly
 * `2·barWidth + BAR_GAP` wide — the bars sit `BAR_GAP` px apart, centered,
 * independent of screen width. Compact Y axis; exact values live in the legend.
 */
export function CashFlowGraph({ income, expenses }: CashFlowGraphProps) {
  const data = [{ label: "cashflow", income, expenses }];
  const max = Math.max(income, expenses, 1);

  return (
    <CompactChart>
      {(size) => (
        <BarChart
          data={data}
          xKey="label"
          yKeys={["income", "expenses"]}
          explicitSize={size}
          orientation="vertical"
          domain={{ y: [0, max] }}
          xAxis={{ tickValues: [0], formatXLabel: () => "" }}
          yAxis={[{ formatYLabel: (v: string | number) => formatAmountCompact(Number(v)) }]}
        >
          {({ points, chartBounds }) => {
            const inner = chartBounds.right - chartBounds.left;
            const groupWidth = 2 * BAR_WIDTH + BAR_GAP;
            const betweenGroupPadding = Math.max(0, Math.min(0.95, 1 - groupWidth / inner));
            return (
              <BarChart.BarGroup
                chartBounds={chartBounds}
                barWidth={BAR_WIDTH}
                betweenGroupPadding={betweenGroupPadding}
                roundedCorners={{ topLeft: 6, topRight: 6 }}
              >
                <BarChart.BarGroupItem points={points.income} colorClassName="accent-positive" />
                <BarChart.BarGroupItem points={points.expenses} colorClassName="accent-danger" />
              </BarChart.BarGroup>
            );
          }}
        </BarChart>
      )}
    </CompactChart>
  );
}
