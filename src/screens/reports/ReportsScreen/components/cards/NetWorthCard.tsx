import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useFormat } from "@/lib/hooks/useFormat";
import { useFirstDayOfWeek } from "@/lib/hooks/useFirstDayOfWeek";
import { Money } from "@/ui/Money";
import type { NetWorthWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { NetWorthGraph } from "../graphs/NetWorthGraph";
import { Change } from "../Change";
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
 * mobile `ReportWidget` (heroui-native-pro `Widget`). Read-only, no navigation.
 */
export function NetWorthCard({ title, height, meta }: NetWorthCardProps) {
  const { t } = useTranslation("reports");
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
  const legend = [{ label: t("series.change"), colorClassName: "bg-chart-1" }];

  return (
    <ReportWidget
      title={title}
      description={description}
      legend={legend}
      height={height}
      footer={
        data ? (
          <View className="flex-row items-center justify-between">
            <Money cents={data.netWorth} tone="plain" className="text-base font-semibold" />
            <Change amount={data.totalChange} />
          </View>
        ) : null
      }
    >
      {data ? <NetWorthGraph graphData={data.graphData} /> : <View className="flex-1" />}
    </ReportWidget>
  );
}
