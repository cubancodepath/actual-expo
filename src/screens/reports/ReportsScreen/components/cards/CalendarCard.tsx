import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Skeleton, cn, useThemeColor } from "heroui-native";
import { Calendar, useCalendar } from "heroui-native-pro";
import { ArrowUp, ArrowDown } from "lucide-react-native";
import { parseDate } from "@internationalized/date";
import * as monthUtils from "@/core/shared/monthUtils";
import { getLatestTransaction } from "@/core/server/transactions";
import { useFirstDayOfWeek, weekdayCode } from "@/lib/hooks/useFirstDayOfWeek";
import { useFormat, type MoneyFormatType } from "@/lib/hooks/useFormat";
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
 * Per-day data provided via context so day cells re-render when the fetch
 * resolves. heroui memoizes the grid, so the `GridBody` render callback captures
 * the `data` from first paint (null); a context read defeats that memo — mounted
 * cells re-render on value change even though the callback isn't re-invoked.
 */
const DayDataContext = createContext<Record<string, CalendarDayValue> | undefined>(undefined);

/**
 * Reports the visible month up so the data fetch follows the native prev/next
 * navigation. Uses `visibleRange.start` — it's the first day of the displayed
 * month (what the heading shows) and, unlike `focusedDate`, it moves on paging
 * (heroui doesn't shift `focusedDate` when `preserveFocusedDayOnPage` is false).
 * Renders nothing.
 */
function MonthSync({ onMonth }: { onMonth: (month: string) => void }) {
  const { visibleRange } = useCalendar();
  const { year, month } = visibleRange.start;
  useEffect(() => {
    onMonth(`${year}-${pad(month)}`);
  }, [year, month, onMonth]);
  return null;
}

type DayCellRenderProps = {
  date: { year: number; month: number; day: number };
  formattedDate: string;
  isOutsideMonth: boolean;
  isToday: boolean;
};

/** Give any non-zero flow a visible floor so small days still read as bars. */
function barHeight(size: number, value: number): number {
  if (!value) return 0;
  return Math.min(100, Math.max(Math.ceil(size), 12));
}

/**
 * A round day cell whose fill is a tiny gauge (upstream `DayButton`): income
 * (green, left) and expense (red, right) rise from the bottom, heights
 * proportional to each day's share of the month total, clipped to the circle by
 * `overflow-hidden`. We render our own cell (not `Calendar.CellBody`) so there's
 * no selection fill — today is marked with a ring only.
 */
function CalendarDayCell({ renderProps }: { renderProps: DayCellRenderProps }) {
  const daysByKey = useContext(DayDataContext);
  const { isOutsideMonth, isToday, formattedDate } = renderProps;
  const day = isOutsideMonth ? undefined : daysByKey?.[keyOf(renderProps.date)];
  const incomeH = day ? barHeight(day.incomeSize, day.incomeValue) : 0;
  const expenseH = day ? barHeight(day.expenseSize, day.expenseValue) : 0;

  return (
    <View
      className={cn(
        "size-10 items-center justify-center overflow-hidden rounded-full",
        isToday && "border border-accent",
      )}
    >
      {incomeH > 0 ? (
        <View
          className="absolute bottom-0 left-0 w-1/2 bg-chart-income opacity-80"
          style={{ height: `${incomeH}%` }}
        />
      ) : null}
      {expenseH > 0 ? (
        <View
          className="absolute bottom-0 right-0 w-1/2 bg-chart-expense opacity-80"
          style={{ height: `${expenseH}%` }}
        />
      ) : null}
      <Text
        className={cn("text-sm font-medium", isOutsideMonth ? "text-muted" : "text-foreground")}
      >
        {formattedDate}
      </Text>
    </View>
  );
}

/**
 * Our own income/expense pill — replaces `TrendChip`, whose width jumps as the
 * value changes between fetches. Colored arrow + amount, fixed padding, right
 * aligned by the header column.
 */
function FlowChip({
  direction,
  amount,
  format,
}: {
  direction: "up" | "down";
  amount: number;
  format: (value: number, type?: MoneyFormatType) => string;
}) {
  const up = direction === "up";
  const [successForeground, dangerForeground] = useThemeColor([
    "success-foreground",
    "danger-foreground",
  ]);
  const Icon = up ? ArrowUp : ArrowDown;

  return (
    <View
      className={cn(
        "flex-row items-center gap-0.5 self-end rounded-full px-2 py-0.5",
        up ? "bg-success" : "bg-danger",
      )}
    >
      <Icon size={11} color={up ? successForeground : dangerForeground} />
      <Text
        className={cn(
          "text-xs font-medium",
          up ? "text-success-foreground" : "text-danger-foreground",
        )}
      >
        {format(amount, "financial")}
      </Text>
    </View>
  );
}

/**
 * Calendar widget — port of desktop-client `CalendarCard`, one month at a time.
 * Reuses heroui-native-pro `Calendar` for the grid, weekday labels, month title,
 * prev/next navigation, and localization; only the per-day income/expense content
 * is ours. Read-only.
 */
export function CalendarCard({ title, height, meta }: CalendarCardProps) {
  const { i18n } = useTranslation("reports");
  const { format } = useFormat();
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

  // Keep the last resolved totals so the header chips don't collapse to $0 (and
  // resize) while a new month is being fetched.
  const [totals, setTotals] = useState({ income: 0, expense: 0 });
  useEffect(() => {
    if (data) setTotals({ income: data.totalIncome, expense: data.totalExpense });
  }, [data]);

  return (
    <ReportWidget height={height}>
      <ReportWidget.Header>
        <ReportWidget.Heading>
          <ReportWidget.Title>{title}</ReportWidget.Title>
        </ReportWidget.Heading>
        {initialMonth ? (
          <ReportWidget.HeaderRight>
            <View className="items-end gap-1 flex-row">
              <FlowChip direction="up" amount={totals.income} format={format} />
              <FlowChip direction="down" amount={-totals.expense} format={format} />
            </View>
          </ReportWidget.HeaderRight>
        ) : null}
      </ReportWidget.Header>

      <ReportWidget.Body>
        {initialMonth ? (
          <DayDataContext.Provider value={data?.daysByKey}>
            <Calendar
              defaultValue={parseDate(`${initialMonth}-01`)}
              firstDayOfWeek={weekdayCode(firstDay)}
              locale={i18n.language}
              isReadOnly
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
                      {(rp) => <CalendarDayCell renderProps={rp} />}
                    </Calendar.Cell>
                  )}
                </Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </DayDataContext.Provider>
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
