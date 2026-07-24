import { useMemo } from "react";
import { View } from "react-native";
import { useCategories } from "@/lib/hooks/useCategories";
import { Money } from "@/ui/Money";
import type { BudgetAnalysisWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { BudgetAnalysisGraph } from "../graphs/BudgetAnalysisGraph";
import { useReport } from "../../hooks/useReport";
import { useLocale } from "../../hooks/useLocale";
import { calculateTimeRange } from "../../data/reportRanges";
import { createBudgetAnalysisSpreadsheet } from "../../data/spreadsheets/budget-analysis-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

type BudgetAnalysisCardProps = {
  title: string;
  height: number;
  meta: BudgetAnalysisWidget["meta"];
};

/**
 * Budget analysis widget — port of desktop-client `BudgetAnalysisCard`.
 * Read-only: budgeted vs spent per month, with the latest running envelope
 * balance (green when positive, red when negative) in the header.
 */
export function BudgetAnalysisCard({ title, height, meta }: BudgetAnalysisCardProps) {
  const locale = useLocale();
  const { categories, groups } = useCategories();

  const [startMonth, endMonth] = calculateTimeRange(meta?.timeFrame);

  const getData = useMemo(
    () =>
      createBudgetAnalysisSpreadsheet({
        conditions: meta?.conditions,
        conditionsOp: meta?.conditionsOp,
        startDate: startMonth,
        endDate: endMonth,
        showHiddenCategories: meta?.showHiddenCategories ?? false,
        categories,
        categoryGroups: groups,
      }),
    [
      meta?.conditions,
      meta?.conditionsOp,
      startMonth,
      endMonth,
      meta?.showHiddenCategories,
      categories,
      groups,
    ],
  );

  const data = useReport(getData);
  const description = formatDateRange(startMonth, endMonth, locale) ?? undefined;
  const balance = data?.intervalData.at(-1)?.balance ?? 0;

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
        {data ? (
          <ReportWidget.HeaderRight>
            <Money
              cents={balance}
              tone="plain"
              className={`text-sm font-semibold ${balance >= 0 ? "text-positive" : "text-danger"}`}
            />
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {data ? <BudgetAnalysisGraph data={data} /> : <View className="flex-1" />}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
