import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Skeleton } from "heroui-native";
import { Calendar, useCalendar } from "heroui-native-pro";
import { parseDate } from "@internationalized/date";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { useFirstDayOfWeek, weekdayCode } from "@/lib/hooks/useFirstDayOfWeek";
import { Money } from "@/ui/Money";
import type { CalendarWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { useReport } from "../../hooks/useReport";
import {
  calendarSpreadsheet,
  type CalendarDayValue,
  type CalendarMonthData,
} from "../../data/spreadsheets/calendar-spreadsheet";

type CalendarCardProps = {
  title: string;
  height: number;
  meta: CalendarWidget["meta"];
};

const pad = (n: number) => String(n).padStart(2, "0");

/** CalendarDate (year/month/day) → "YYYY-MM-DD" key, matching the spreadsheet. */
function keyOf(date: { year: number; month: number; day: number }): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * Reads the heroui calendar's visible range and reports the visible month up, so
 * the data fetch follows the native prev/next navigation. Renders nothing.
 */
function MonthSync({ onMonth }: { onMonth: (month: string) => void }) {
  const { visibleRange } = useCalendar();
  const { year, month } = visibleRange.start;
  useEffect(() => {
    onMonth(`${year}-${pad(month)}`);
  }, [year, month, onMonth]);
  return null;
}

type DayCellProps = {
  renderProps: { formattedDate: string; isOutsideMonth: boolean };
  day?: CalendarDayValue;
};

/**
 * A single day cell: the day number plus two bottom-anchored mini-bars — income
 * (green, left half) and expense (red, right half), heights proportional to the
 * month total (upstream `DayButton`). A faint full-height tint marks days with
 * activity. Outside-month days render empty.
 */
function CalendarDayCell({ renderProps, day }: DayCellProps) {
  if (renderProps.isOutsideMonth) {
    return <Calendar.CellBody cellRenderProps={renderProps as never} />;
  }
  const hasIncome = !!day && day.incomeValue !== 0;
  const hasExpense = !!day && day.expenseValue !== 0;

  return (
    <Calendar.CellBody cellRenderProps={renderProps as never} className="overflow-hidden">
      {hasIncome ? (
        <View className="absolute bottom-0 left-0 top-0 w-1/2 bg-chart-income opacity-10" />
      ) : null}
      {hasExpense ? (
        <View className="absolute bottom-0 right-0 top-0 w-1/2 bg-chart-expense opacity-10" />
      ) : null}
      {hasIncome ? (
        <View
          className="absolute bottom-0 left-0 w-1/2 bg-chart-income opacity-90"
          style={{ height: `${Math.ceil(day!.incomeSize)}%` }}
        />
      ) : null}
      {hasExpense ? (
        <View
          className="absolute bottom-0 right-0 w-1/2 bg-chart-expense opacity-90"
          style={{ height: `${Math.ceil(day!.expenseSize)}%` }}
        />
      ) : null}
      <Calendar.CellLabel cellRenderProps={renderProps as never}>
        {renderProps.formattedDate}
      </Calendar.CellLabel>
    </Calendar.CellBody>
  );
}

/**
 * Calendar widget — port of desktop-client `CalendarCard`, one month at a time.
 * Reuses heroui-native-pro `Calendar` for the grid, weekday labels, month title,
 * prev/next navigation, and localization; only the per-day income/expense content
 * is ours. Read-only.
 */
export function CalendarCard({ title, height, meta }: CalendarCardProps) {
  const { t, i18n } = useTranslation("reports");
  const firstDay = useFirstDayOfWeek();

  const [initialMonth, setInitialMonth] = useState<string | null>(null);
  const [visibleMonth, setVisibleMonth] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getLatestTransaction().then((tx) => {
      if (cancelled) return;
      const month = monthUtils.monthFromDate(tx ? tx.date : monthUtils.currentDay());
      setInitialMonth(month);
      setVisibleMonth(month);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const getData = useMemo<(setData: (d: CalendarMonthData) => void) => Promise<void>>(
    () =>
      visibleMonth
        ? calendarSpreadsheet(visibleMonth, meta?.conditions, meta?.conditionsOp)
        : async () => {},
    [visibleMonth, meta?.conditions, meta?.conditionsOp],
  );

  const data = useReport(getData);

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
        </ReportWidget.Heading>
        {data ? (
          <ReportWidget.HeaderRight>
            <View className="items-end gap-0.5">
              <View className="flex-row items-center gap-1">
                <ReportWidget.Description>{t("series.income")}</ReportWidget.Description>
                <Money
                  cents={data.totalIncome}
                  tone="plain"
                  className="text-xs font-medium text-positive"
                />
              </View>
              <View className="flex-row items-center gap-1">
                <ReportWidget.Description>{t("series.expenses")}</ReportWidget.Description>
                <Money
                  cents={-data.totalExpense}
                  tone="plain"
                  className="text-xs font-medium text-danger"
                />
              </View>
            </View>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {initialMonth ? (
          <Calendar
            defaultValue={parseDate(`${initialMonth}-01`)}
            firstDayOfWeek={weekdayCode(firstDay)}
            locale={i18n.language}
          >
            <MonthSync onMonth={setVisibleMonth} />
            <Calendar.Header>
              <Calendar.Heading />
              <Calendar.NavButton slot="previous" />
              <Calendar.NavButton slot="next" />
            </Calendar.Header>
            <Calendar.Grid>
              <Calendar.GridHeader>
                {(dayLabel) => <Calendar.HeaderCell day={dayLabel} />}
              </Calendar.GridHeader>
              <Calendar.GridBody>
                {(date) => (
                  <Calendar.Cell date={date}>
                    {(rp) => (
                      <CalendarDayCell renderProps={rp} day={data?.daysByKey[keyOf(rp.date)]} />
                    )}
                  </Calendar.Cell>
                )}
              </Calendar.GridBody>
            </Calendar.Grid>
          </Calendar>
        ) : (
          <View className="flex-1 justify-center gap-2">
            <Skeleton className="h-4 w-1/3 rounded-md" />
            <Skeleton className="h-40 w-full rounded-lg" />
          </View>
        )}
      </ReportWidget.Body>
    </ReportWidget>
  );
}
