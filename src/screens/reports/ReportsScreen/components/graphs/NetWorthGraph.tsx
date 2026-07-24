import { AreaChart, LineChart } from "heroui-native-pro";
import { formatAmountCompact } from "@/core/shared/util";
import type { NetWorthData } from "../../data/spreadsheets/net-worth-spreadsheet";
import { CompactChart } from "./CompactChart";

type NetWorthGraphProps = {
  graphData: NetWorthData["graphData"];
  /** Net worth is negative → color the trend red instead of green. */
  negative?: boolean;
};

/**
 * Compact net-worth trend — heroui-native-pro `AreaChart` plotting the net-worth
 * series (upstream `NetWorthGraph`). "Inverted" fill: anchored to the TOP
 * (`y0 = chartBounds.top`) so it shades upward from the curve; a `LineChart.Line`
 * draws the crisp top edge. Y axis shows compact amounts ("$10k") using heroui's
 * themed axis font. The LINE is always green; only the fill turns red when net
 * worth is negative. All via `colorClassName` — no Skia.
 */
export function NetWorthGraph({ graphData, negative = false }: NetWorthGraphProps) {
  const data = graphData.data;
  if (data.length === 0) return <CompactChart>{() => null}</CompactChart>;

  const fillColor = negative ? "accent-danger" : "accent-positive";

  return (
    <CompactChart>
      {(size) => (
        <AreaChart
          data={data}
          xKey="x"
          yKeys={["y"]}
          explicitSize={size}
          orientation="vertical"
          yAxis={[{ formatYLabel: (v: string | number) => formatAmountCompact(Number(v)) }]}
        >
          {({ points, chartBounds }) => (
            <>
              <AreaChart.Area
                points={points.y}
                y0={chartBounds.top}
                curveType="monotoneX"
                colorClassName={fillColor}
              />
              <LineChart.Line
                points={points.y}
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
