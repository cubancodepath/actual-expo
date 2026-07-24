import { AreaChart } from "heroui-native-pro";
import type { NetWorthData } from "../../data/spreadsheets/net-worth-spreadsheet";
import { CompactChart } from "./CompactChart";

type NetWorthGraphProps = {
  graphData: NetWorthData["graphData"];
};

/**
 * Compact net-worth trend — heroui-native-pro `AreaChart` plotting the net-worth
 * series (upstream `NetWorthGraph`, compact mode). Filled area with a smooth
 * curve; no axes/legend (the legend lives in the widget header).
 */
export function NetWorthGraph({ graphData }: NetWorthGraphProps) {
  const data = graphData.data;
  if (data.length === 0) return <CompactChart>{() => null}</CompactChart>;

  return (
    <CompactChart>
      {(size) => (
        <AreaChart data={data} xKey="x" yKeys={["y"]} explicitSize={size} orientation="vertical">
          {({ points, chartBounds }) => (
            <AreaChart.Area
              points={points.y}
              y0={chartBounds.bottom}
              curveType="monotoneX"
              colorClassName="accent-chart-1"
            />
          )}
        </AreaChart>
      )}
    </CompactChart>
  );
}
