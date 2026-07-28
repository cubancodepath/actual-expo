import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";
import { Popover, Skeleton, cn, useThemeColor } from "heroui-native";
import { Calendar, useCalendar } from "heroui-native-pro";
import { ArrowUp, ArrowDown } from "lucide-react-native";
import { parseDate } from "@internationalized/date";
import * as monthUtils from "@/core/shared/monthUtils";
import { useFirstDayOfWeek, weekdayCode } from "@/lib/hooks/useFirstDayOfWeek";
import { useFormat, type MoneyFormatType } from "@/lib/hooks/useFormat";
import type { CalendarWidget } from "@/core/types/models/dashboard";
import { ReportWidget } from "../ReportWidget";
import { useReport } from "../../hooks/useReport";
import { useLatestTransactionDate } from "../../hooks/useTransactionBounds";
import { SurfaceLevel } from "@/ui/surface-level";
import {
  calendarSpreadsheet,
  type CalendarDayValue,
  type CalendarMonthData,
} from "../../data/spreadsheets/calendar-spreadsheet";

type CalendarCardProps = {
  title: string;
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

/** A day's flow as a bar height %: its share of the month total, floored so small
 * days still show a visible bar, 0 when there was no flow. */
function barPct(size: number, value: number): number {
  if (!value) return 0;
  return Math.min(100, Math.max(Math.ceil(size), 15));
}

/**
 * A day cell laid out like Apple's activity calendar: the day number on top, and
 * below it a small pair of bars — income (green) and expense (red) — rising from
 * a fixed-height slot, each scaled to the day's share of the month total and
 * capped with a rounded top like our other charts. The slot is always reserved
 * for in-month days so days with no activity keep the same layout. Today's number
 * gets a filled accent circle. Tapping an in-month day opens a summary popover.
 */
function CalendarDayCell({ renderProps }: { renderProps: DayCellRenderProps }) {
  const daysByKey = useContext(DayDataContext);
  const { format } = useFormat();
  const { t, i18n } = useTranslation("reports");
  const { isOutsideMonth, isToday, formattedDate, date } = renderProps;
  const day = isOutsideMonth ? undefined : daysByKey?.[keyOf(date)];
  const incomePct = day ? barPct(day.incomeSize, day.incomeValue) : 0;
  const expensePct = day ? barPct(day.expenseSize, day.expenseValue) : 0;

  const content = (
    <View className="w-full items-center justify-center gap-0.5">
      {/* Fixed-size circle keeps the number a perfect circle when today is
          highlighted (a 2-digit padded pill reads as an oval) and gives every
          cell the same number height so rows stay aligned. */}
      <View
        className={cn("size-5 items-center justify-center rounded-full", isToday && "bg-accent")}
      >
        <Text
          className={cn(
            "text-xs font-medium",
            isToday ? "text-accent-foreground" : isOutsideMonth ? "text-muted" : "text-foreground",
          )}
        >
          {formattedDate}
        </Text>
      </View>
      {/* Always reserve the bar slot (even for empty / outside-month days) so
          every number sits at the same height. */}
      <View className="h-7 flex-row items-end justify-center gap-1">
        {incomePct > 0 ? (
          <View
            className="w-1.5 rounded-t-xs bg-chart-income"
            style={{ height: `${incomePct}%` }}
          />
        ) : null}
        {expensePct > 0 ? (
          <View
            className="w-1.5 rounded-t-xs bg-chart-expense"
            style={{ height: `${expensePct}%` }}
          />
        ) : null}
      </View>
    </View>
  );

  // Outside-month days belong to another month — not interactive.
  if (isOutsideMonth) return content;

  const income = day?.incomeValue ?? 0;
  const expense = day?.expenseValue ?? 0;
  const label = new Date(date.year, date.month - 1, date.day).toLocaleDateString(i18n.language, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  // Tap a day to see its summary — the mobile stand-in for the desktop hover
  // tooltip (date + income / expense amounts and their share of the month).
  return (
    <Popover>
      <Popover.Trigger>{content}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content
          presentation="popover"
          placement="top"
          width={200}
          className="gap-2 rounded-xl border border-border px-4 py-3"
        >
          <SurfaceLevel context="sheet">
            <Popover.Arrow />
            <Popover.Title className="text-sm">{label}</Popover.Title>
            <View className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted">{t("series.income")}</Text>
                <Text className="text-xs font-medium text-positive">
                  {format(income, "financial")}
                </Text>
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-muted">{t("series.expenses")}</Text>
                <Text className="text-xs font-medium text-danger">
                  {format(-expense, "financial")}
                </Text>
              </View>
            </View>
          </SurfaceLevel>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
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
export function CalendarCard({ title, meta }: CalendarCardProps) {
  const { i18n } = useTranslation("reports");
  const { format } = useFormat();
  const firstDay = useFirstDayOfWeek();

  const latestDate = useLatestTransactionDate();
  const initialMonth = useMemo(
    () => (latestDate ? monthUtils.monthFromDate(latestDate) : null),
    [latestDate],
  );

  const [visibleMonth, setVisibleMonth] = useState("");
  useEffect(() => {
    if (initialMonth) setVisibleMonth(initialMonth);
  }, [initialMonth]);

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
    // No fixed height: the calendar sizes to its content so 5- and 6-week months
    // fit exactly (a fixed height either clips the last week or leaves a big gap).
    <ReportWidget>
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
                    // Override the default aspect-square so the taller
                    // number-over-rings cell fits (width + height both set ⇒ RN
                    // ignores the base aspect-ratio).
                    <Calendar.Cell date={date} className="aspect-auto h-[52px]">
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
