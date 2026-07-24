import { BarChart } from "heroui-native-pro";
import { formatAmountCompact } from "@/core/shared/util";
import { CompactChart } from "./CompactChart";

type CashFlowGraphProps = {
  /** Income total (positive cents). */
  income: number;
  /** Expenses as a positive magnitude (cents); upstream negates the raw sum. */
  expenses: number;
};

const DATA_X = [{ label: "cashflow" }];

/**
 * Compact cash-flow visual — port of desktop-client `CashFlowCard`'s two-bar
 * chart. Income (green) and expenses (red) as a side-by-side pair via heroui
 * `BarChart.BarGroup`, both plotted as positive magnitudes so the taller bar
 * reads as the larger flow. Compact Y axis; no Skia. Values themselves are shown
 * in the card's legend/header.
 */
export function CashFlowGraph({ income, expenses }: CashFlowGraphProps) {
  const data = [{ ...DATA_X[0], income, expenses }];
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
          xAxis={{ tickValues: [0] }}
          yAxis={[{ formatYLabel: (v: string | number) => formatAmountCompact(Number(v)) }]}
        >
          {({ points, chartBounds }) => (
            <BarChart.BarGroup chartBounds={chartBounds} barWidth={28}>
              <BarChart.BarGroupItem points={points.income} colorClassName="accent-positive" />
              <BarChart.BarGroupItem points={points.expenses} colorClassName="accent-danger" />
            </BarChart.BarGroup>
          )}
        </BarChart>
      )}
    </CompactChart>
  );
}
