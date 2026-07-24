import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { TrendChip } from "heroui-native-pro";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { useFormat } from "@/lib/hooks/useFormat";
import { Money } from "@/ui/Money";
import type { CashFlowWidget } from "@/core/types/models/dashboard";
import type { TimeFrame } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { CashFlowGraph } from "../graphs/CashFlowGraph";
import { useReport } from "../../hooks/useReport";
import { useLocale } from "../../hooks/useLocale";
import { calculateTimeRange } from "../../data/reportRanges";
import { simpleCashFlow } from "../../data/spreadsheets/cash-flow-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

/** Cash-flow default range: current month to today (upstream `defaultTimeFrame`). */
const defaultTimeFrame: TimeFrame = {
  start: monthUtils.dayFromDate(monthUtils.currentMonth()),
  end: monthUtils.currentDay(),
  mode: "sliding-window",
};

type CashFlowCardProps = {
  title: string;
  height: number;
  meta: CashFlowWidget["meta"];
};

/**
 * Cash flow widget — port of desktop-client `CashFlowCard` (the dashboard card,
 * i.e. `simpleCashFlow`). Read-only: income vs expenses bars, a net-change
 * TrendChip in the header, and the two totals in a legend footer.
 */
export function CashFlowCard({ title, height, meta }: CashFlowCardProps) {
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const { format } = useFormat();

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

  const [start, end] = calculateTimeRange(meta?.timeFrame, defaultTimeFrame, latestTransaction);

  const getData = useMemo(
    () => simpleCashFlow(start, end, meta?.conditions, meta?.conditionsOp),
    [start, end, meta?.conditions, meta?.conditionsOp],
  );

  const data = useReport(getData);

  const description = formatDateRange(start, end, locale) ?? undefined;

  // Upstream negates the raw expense sum so it reads as a positive magnitude.
  const income = data?.graphData.income ?? 0;
  const expenses = -(data?.graphData.expense ?? 0);
  const netChange = income - expenses;
  const trend = netChange > 0 ? "up" : netChange < 0 ? "down" : "neutral";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
        {data ? (
          <ReportWidget.HeaderRight>
            <TrendChip trend={trend} size="sm" variant="primary">
              {format(Math.abs(netChange), "financial")}
            </TrendChip>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {data ? <CashFlowGraph income={income} expenses={expenses} /> : <View className="flex-1" />}
      </ReportWidget.Body>

      {data ? (
        <ReportWidget.Footer>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full bg-chart-income" />
              <ReportWidget.Description>{t("series.income")}</ReportWidget.Description>
              <Money cents={income} tone="plain" className="text-xs font-medium" />
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="size-2 rounded-full bg-chart-expense" />
              <ReportWidget.Description>{t("series.expenses")}</ReportWidget.Description>
              <Money cents={-expenses} tone="plain" className="text-xs font-medium" />
            </View>
          </View>
        </ReportWidget.Footer>
      ) : null}
    </ReportWidget>
  );
}
