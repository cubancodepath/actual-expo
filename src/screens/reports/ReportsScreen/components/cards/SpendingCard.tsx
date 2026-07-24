import { useMemo } from "react";
import { TrendChip } from "heroui-native-pro";
import * as monthUtils from "@/core/shared/monthUtils";
import { useCategories } from "@/lib/hooks/useCategories";
import { useFormat } from "@/lib/hooks/useFormat";
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";
import type { SpendingWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { WidgetSkeleton } from "../WidgetSkeleton";
import { SpendingGraph } from "../graphs/SpendingGraph";
import { useReport } from "../../hooks/useReport";
import { useLocale } from "../../hooks/useLocale";
import { calculateSpendingReportTimeRange } from "../../data/reportRanges";
import { normalizeSpendingAverageRange } from "../../data/spendingAverageRange";
import { createSpendingSpreadsheet } from "../../data/spreadsheets/spending-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

type SpendingCardProps = {
  title: string;
  height: number;
  meta: SpendingWidget["meta"];
};

/**
 * Spending widget — port of desktop-client `SpendingCard`. Read-only: cumulative
 * spending for the compare month vs a comparison (prior month / average /
 * budget), with a "spent more/less" chip in the header.
 */
export function SpendingCard({ title, height, meta }: SpendingCardProps) {
  const { format } = useFormat();
  const locale = useLocale();
  const { categories, groups } = useCategories();
  const [budgetTypePref] = useSyncedPref("budgetType");
  const budgetType: "envelope" | "tracking" =
    budgetTypePref === "tracking" ? "tracking" : "envelope";

  const mode = meta?.mode ?? "single-month";
  const averageRange = normalizeSpendingAverageRange(meta?.averageRange);
  const [compare, compareTo] = calculateSpendingReportTimeRange({
    compare: meta?.compare,
    compareTo: meta?.compareTo,
    isLive: meta?.isLive,
    mode,
  });

  const getData = useMemo(
    () =>
      createSpendingSpreadsheet({
        conditions: meta?.conditions,
        conditionsOp: meta?.conditionsOp,
        compare,
        compareTo,
        averageRange,
        budgetType,
        categories,
        categoryGroups: groups,
      }),
    [
      meta?.conditions,
      meta?.conditionsOp,
      compare,
      compareTo,
      averageRange,
      budgetType,
      categories,
      groups,
    ],
  );

  const data = useReport(getData);
  const description = formatDateRange(compare, compareTo, locale) ?? undefined;

  // The compare-vs-comparison delta at "today" (upstream picks day index 27 for
  // past months, else today-1, capped at 27). Positive = spent more than the
  // comparison → worse (red / down).
  const difference = useMemo(() => {
    if (!data) return null;
    const todayDay =
      compare !== monthUtils.currentMonth()
        ? 27
        : Math.min(monthUtils.getDay(monthUtils.currentDay()) - 1, 27);
    const row = data.intervalData[todayDay];
    if (!row) return null;
    const selection =
      mode === "single-month" ? row.compareTo : mode === "average" ? row.average : row.budget;
    return Math.round(selection - row.compare);
  }, [data, compare, mode]);

  const trend = difference == null || difference === 0 ? "neutral" : difference > 0 ? "down" : "up";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
        {difference != null ? (
          <ReportWidget.HeaderRight>
            <TrendChip trend={trend} size="sm" variant="primary">
              {format(Math.abs(difference), "financial")}
            </TrendChip>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {data ? <SpendingGraph data={data} mode={mode} /> : <WidgetSkeleton />}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
