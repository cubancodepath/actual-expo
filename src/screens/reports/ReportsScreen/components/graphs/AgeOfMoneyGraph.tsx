import { AreaChart, LineChart } from "heroui-native-pro";
import type { AgeOfMoneyData } from "../../data/spreadsheets/age-of-money-spreadsheet";
import { CompactChart } from "./CompactChart";

type AgeOfMoneyGraphProps = {
  data: AgeOfMoneyData["graphData"];
};

/**
 * Compact age-of-money trend — port of desktop-client `AgeOfMoneyGraph` (compact
 * mode). Area + line of the rolling age (in days) over time, on heroui-native-pro
 * charts (victory + Skia, so press state stays available). Y axis in days. Green
 * throughout — the card's KPI conveys the good/bad tiers.
 */
export function AgeOfMoneyGraph({ data }: AgeOfMoneyGraphProps) {
  if (data.length === 0) return <CompactChart>{() => null}</CompactChart>;

  const maxAge = Math.max(...data.map((d) => d.ageOfMoney), 30);
  const yAxisMax = Math.ceil(maxAge / 10) * 10 + 10;

  return (
    <CompactChart>
      {(size) => (
        <AreaChart
          data={data}
          xKey="date"
          yKeys={["ageOfMoney"]}
          explicitSize={size}
          orientation="vertical"
          domain={{ y: [0, yAxisMax] }}
          yAxis={[{ formatYLabel: (v: string | number) => `${Math.round(Number(v))}d` }]}
        >
          {({ points, chartBounds }) => (
            <>
              <AreaChart.Area
                points={points.ageOfMoney}
                y0={chartBounds.bottom}
                curveType="monotoneX"
                colorClassName="accent-positive"
              />
              <LineChart.Line
                points={points.ageOfMoney}
                curveType="monotoneX"
                colorClassName="accent-positive"
              />
            </>
          )}
        </AreaChart>
      )}
    </CompactChart>
  );
}
