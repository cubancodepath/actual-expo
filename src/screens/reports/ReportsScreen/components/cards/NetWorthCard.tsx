import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { TrendChip } from "heroui-native-pro";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useFormat } from "@/lib/hooks/useFormat";
import { useFirstDayOfWeek } from "@/lib/hooks/useFirstDayOfWeek";
import { Money } from "@/ui/Money";
import type { NetWorthWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { NetWorthGraph } from "../graphs/NetWorthGraph";
import { useReport } from "../../hooks/useReport";
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

  const [latestTransaction, setLatestTransaction] = useState("");
  useEffect(() => {
    let cancelled = false;
    void getLatestTransaction().then((tx) => {
      if (!cancelled) setLatestTransaction(tx ? tx.date : monthUtils.currentDay());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [start, end] = calculateTimeRange(meta?.timeFrame, undefined, latestTransaction);

  const getData = useMemo(
    () =>
      createSpreadsheet(
        start,
        end,
        accounts,
        meta?.conditions,
        meta?.conditionsOp,
        locale,
        meta?.interval || "Monthly",
        firstDayOfWeekIdx,
        format,
      ),
    [
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
          <View className="flex-1" />
        )}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
