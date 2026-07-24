import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Card, Skeleton } from "heroui-native";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { Money } from "@/ui/Money";
import type { SummaryContent, SummaryWidget } from "@/core/types/models/dashboard";
import type { TimeFrame } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { useReport } from "../../hooks/useReport";
import { useLocale } from "../../hooks/useLocale";
import { calculateTimeRange } from "../../data/reportRanges";
import { summarySpreadsheet } from "../../data/spreadsheets/summary-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

/** Summary default range: this month, `full` mode (upstream default). */
const defaultTimeFrame: TimeFrame = {
  start: monthUtils.dayFromDate(monthUtils.currentMonth()),
  end: monthUtils.currentDay(),
  mode: "full",
};

function parseContent(raw?: string): SummaryContent {
  if (!raw) return { type: "sum" };
  try {
    return JSON.parse(raw) as SummaryContent;
  } catch {
    return { type: "sum" };
  }
}

type SummaryCardProps = {
  title: string;
  height: number;
  meta: SummaryWidget["meta"];
};

/**
 * Summary widget — port of desktop-client `SummaryCard`. Shows one number: a
 * sum, an average (per transaction / month / year), or a percentage. Money-typed
 * results render through {@link Money}; percentages render as a plain number with
 * a `%` suffix.
 */
export function SummaryCard({ title, height, meta }: SummaryCardProps) {
  const locale = useLocale();

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

  const content = useMemo(() => parseContent(meta?.content), [meta?.content]);

  const getData = useMemo(
    () => summarySpreadsheet(start, end, meta?.conditions, meta?.conditionsOp, content, locale),
    [start, end, meta?.conditions, meta?.conditionsOp, content, locale],
  );

  const data = useReport(getData);

  const description = formatDateRange(start, end, locale) ?? undefined;
  const isPercentage = content.type === "percentage";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
      </ReportWidget.Header>

      <ReportWidget.Body>
        <View className="flex-1 items-center justify-center">
          {data ? (
            isPercentage ? (
              <Card.Title className="text-2xl font-semibold">
                {`${Math.round((data.total ?? 0) * 100) / 100}%`}
              </Card.Title>
            ) : (
              <Money cents={data.total ?? 0} tone="auto" className="text-2xl font-semibold" />
            )
          ) : (
            <Skeleton className="h-8 w-24 rounded-md" />
          )}
        </View>
      </ReportWidget.Body>
    </ReportWidget>
  );
}
