import { useMemo } from "react";
import { View } from "react-native";
import { TrendChip } from "heroui-native-pro";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useFormat } from "@/lib/hooks/useFormat";
import { useFirstDayOfWeek } from "@/lib/hooks/useFirstDayOfWeek";
import { Money } from "@/ui/Money";
import type { NetWorthWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { WidgetSkeleton } from "../WidgetSkeleton";
import { NetWorthGraph } from "../graphs/NetWorthGraph";
import { useReport } from "../../hooks/useReport";
import { useLatestTransactionDate } from "../../hooks/useTransactionBounds";
import { useLocale } from "../../hooks/useLocale";
import { calculateTimeRange } from "../../data/reportRanges";
import { createSpreadsheet } from "../../data/spreadsheets/net-worth-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

type NetWorthCardProps = {
  title: string;
  height: number;
  meta: NetWorthWidget["meta"];
};

/**
 * Net worth widget — port of desktop-client `NetWorthCard`, wired into the
 * mobile `ReportWidget` (a heroui-native `Card`). Read-only, no navigation.
 */
export function NetWorthCard({ title, height, meta }: NetWorthCardProps) {
  const locale = useLocale();
  const { format } = useFormat();
  const { accounts } = useAccounts();
  const firstDayOfWeekIdx = String(useFirstDayOfWeek());

  const latestTransaction = useLatestTransactionDate();

  const [start, end] = calculateTimeRange(meta?.timeFrame, undefined, latestTransaction ?? "");

  // No spreadsheet until the boundary date resolves — building it with a
  // placeholder range and rebuilding after would run the queries twice.
  const getData = useMemo(
    () =>
      latestTransaction
        ? createSpreadsheet(
            start,
            end,
            accounts,
            meta?.conditions,
            meta?.conditionsOp,
            locale,
            meta?.interval || "Monthly",
            firstDayOfWeekIdx,
            format,
          )
        : async () => {},
    [
      latestTransaction,
      start,
      end,
      accounts,
      meta?.conditions,
      meta?.conditionsOp,
      locale,
      meta?.interval,
      firstDayOfWeekIdx,
      format,
    ],
  );

  const data = useReport(getData);

  const description = formatDateRange(start, end, locale) ?? undefined;

  const trend = data
    ? data.totalChange > 0
      ? "up"
      : data.totalChange < 0
        ? "down"
        : "neutral"
    : "neutral";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
        {data ? (
          <ReportWidget.HeaderRight>
            <View className="items-end gap-1">
              <View className="pr-2">
                <Money cents={data.netWorth} tone="plain" className="text-xs font-semibold" />
              </View>
              <TrendChip trend={trend} size="sm" variant="primary">
                {format(Math.abs(data.totalChange), "financial")}
              </TrendChip>
            </View>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {data ? (
          <NetWorthGraph graphData={data.graphData} negative={data.netWorth < 0} />
        ) : (
          <WidgetSkeleton />
        )}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
