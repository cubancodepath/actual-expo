import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import type { AgeOfMoneyWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { AgeOfMoneyGraph } from "../graphs/AgeOfMoneyGraph";
import { useReport } from "../../hooks/useReport";
import { useLocale } from "../../hooks/useLocale";
import { calculateTimeRange } from "../../data/reportRanges";
import { createAgeOfMoneySpreadsheet } from "../../data/spreadsheets/age-of-money-spreadsheet";
import { formatDateRange } from "../../lib/formatDateRange";

/** Age tier → text color class (upstream `getAgeColor`). */
function ageColorClass(age: number | null): string {
  if (age === null) return "text-muted";
  if (age >= 30) return "text-positive";
  if (age >= 14) return "text-warning";
  return "text-danger";
}

type AgeOfMoneyCardProps = {
  title: string;
  height: number;
  meta: AgeOfMoneyWidget["meta"];
};

/**
 * Age of Money widget — port of desktop-client `AgeOfMoneyCard`. Read-only: the
 * current age (in days, colored by tier), a trend line, and a compact area chart.
 */
export function AgeOfMoneyCard({ title, height, meta }: AgeOfMoneyCardProps) {
  const { t } = useTranslation("reports");
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

  const [start, end] = calculateTimeRange(meta?.timeFrame, undefined, latestTransaction);

  const getData = useMemo(
    () =>
      createAgeOfMoneySpreadsheet({
        start,
        end,
        conditions: meta?.conditions,
        conditionsOp: meta?.conditionsOp,
        granularity: meta?.granularity ?? "monthly",
      }),
    [start, end, meta?.conditions, meta?.conditionsOp, meta?.granularity],
  );

  const data = useReport(getData);
  const description = formatDateRange(start, end, locale) ?? undefined;

  const trendLabel = data
    ? data.trend === "up"
      ? `↑ ${t("ageOfMoney.improving")}`
      : data.trend === "down"
        ? `↓ ${t("ageOfMoney.declining")}`
        : `→ ${t("ageOfMoney.stable")}`
    : "";

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
          {description ? <ReportWidget.Description>{description}</ReportWidget.Description> : null}
        </ReportWidget.Heading>
        {data ? (
          <ReportWidget.HeaderRight>
            <View className="items-end gap-0.5">
              <ReportWidget.Title
                className={`text-lg font-semibold ${ageColorClass(data.currentAge)}`}
              >
                {data.currentAge !== null
                  ? t("ageOfMoney.days", { count: data.currentAge })
                  : t("ageOfMoney.notAvailable")}
              </ReportWidget.Title>
              {data.currentAge !== null ? (
                <ReportWidget.Description>{trendLabel}</ReportWidget.Description>
              ) : null}
              {data.insufficientData ? (
                <ReportWidget.Description className="text-warning">
                  {t("ageOfMoney.incompleteData")}
                </ReportWidget.Description>
              ) : null}
            </View>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {data ? <AgeOfMoneyGraph data={data.graphData} /> : <View className="flex-1" />}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
