/**
 * Report date-range helpers — faithful port of desktop-client
 * `components/reports/reportRanges.ts`. Pure; swaps `monthUtils` to
 * `@/core/shared/monthUtils` and `SyncedPrefs['firstDayOfWeekIdx']` to
 * `string | undefined`.
 */
import * as monthUtils from "@/core/shared/monthUtils";
import type { TimeFrame } from "@/core/types/models/dashboard";

type FirstDayOfWeekIdx = string | undefined;

export function validateStart(
  earliest: string,
  latest: string,
  start: string,
  end: string,
  interval?: string,
  firstDayOfWeekIdx?: FirstDayOfWeekIdx,
): [string, string, TimeFrame["mode"]] {
  let addDays: number;
  let dateStart: string;
  switch (interval) {
    case "Monthly":
      dateStart = start + "-01";
      addDays = 180;
      break;
    case "Yearly":
      dateStart = start + "-01-01";
      addDays = 1095;
      break;
    case "Daily":
      dateStart = start;
      addDays = 6;
      break;
    default:
      dateStart = start;
      addDays = 180;
      break;
  }

  if (end < start) {
    end = monthUtils.addDays(dateStart, addDays);
  }
  return boundedRange(
    earliest,
    latest,
    dateStart,
    interval ? end : monthUtils.monthFromDate(end),
    interval,
    firstDayOfWeekIdx,
  );
}

export function validateEnd(
  earliest: string,
  latest: string,
  start: string,
  end: string,
  interval?: string,
  firstDayOfWeekIdx?: FirstDayOfWeekIdx,
): [string, string, TimeFrame["mode"]] {
  let subDays: number;
  let dateEnd: string;
  switch (interval) {
    case "Monthly":
      dateEnd = monthUtils.getMonthEnd(end + "-01");
      subDays = 180;
      break;
    case "Yearly":
      dateEnd = end + "-12-31";
      subDays = 1095;
      break;
    case "Daily":
      dateEnd = end;
      subDays = 6;
      break;
    default:
      dateEnd = end;
      subDays = 180;
      break;
  }

  if (start > end) {
    start = monthUtils.subDays(dateEnd, subDays);
  }
  return boundedRange(
    earliest,
    latest,
    interval ? start : monthUtils.monthFromDate(start),
    dateEnd,
    interval,
    firstDayOfWeekIdx,
  );
}

export function validateRange(earliest: string, start: string, end: string): [string, string] {
  if (start < earliest) {
    start = earliest;
  }
  return [start, end];
}

function boundedRange(
  earliest: string,
  latest: string,
  start: string,
  end: string,
  interval?: string,
  _firstDayOfWeekIdx?: FirstDayOfWeekIdx,
): [string, string, "static"] {
  switch (interval) {
    case "Daily":
      latest = monthUtils.currentDay();
      break;
    case "Weekly":
      latest = monthUtils.currentDay();
      break;
    case "Monthly":
      latest = monthUtils.getMonthEnd(monthUtils.currentDay());
      break;
    case "Yearly":
      latest = monthUtils.currentDay();
      break;
    default:
      break;
  }

  if (end > latest) {
    end = latest;
  }
  if (start < earliest) {
    start = earliest;
  }
  return [start, end, "static"];
}

export function getSpecificRange(
  offset: number,
  addNumber: number | null,
  type?: string,
  firstDayOfWeekIdx?: FirstDayOfWeekIdx,
) {
  const currentDay = monthUtils.currentDay();
  const currentWeek = monthUtils.currentWeek(firstDayOfWeekIdx);

  let dateStart = monthUtils.subMonths(currentDay, offset) + "-01";
  let dateEnd = monthUtils.getMonthEnd(
    monthUtils.addMonths(dateStart, addNumber === null ? offset : addNumber) + "-01",
  );

  if (type === "Week") {
    dateStart = monthUtils.subWeeks(currentWeek, offset);
    dateEnd = monthUtils.getWeekEnd(
      monthUtils.addWeeks(dateStart, addNumber === null ? offset : addNumber),
      firstDayOfWeekIdx,
    );
  }

  return [dateStart, dateEnd, "static"];
}

export function getFullRange(start: string, end: string) {
  return [start, end, "full"] as const;
}

export function getLatestRange(offset: number) {
  const end = monthUtils.currentMonth();
  const start = monthUtils.subMonths(end, offset);
  return [start, end, "sliding-window"] as const;
}

export function getNextRange(offset: number) {
  const start = monthUtils.currentMonth();
  const end = monthUtils.addMonths(start, offset);
  return [start, end, "static"] as const;
}

export function getFullFutureRange(latestMonth?: string) {
  const start = monthUtils.currentMonth();
  const defaultEnd = monthUtils.addMonths(start, 24);
  const end = latestMonth && monthUtils.isAfter(latestMonth, start) ? latestMonth : defaultEnd;
  return [start, end, "static"] as const;
}

export function calculateTimeRange(
  timeFrame?: Partial<TimeFrame>,
  defaultTimeFrame?: TimeFrame,
  latestTransaction?: string,
) {
  const start =
    timeFrame?.start ??
    defaultTimeFrame?.start ??
    monthUtils.subMonths(monthUtils.currentMonth(), 5);
  const end = timeFrame?.end ?? defaultTimeFrame?.end ?? monthUtils.currentMonth();
  const mode = timeFrame?.mode ?? defaultTimeFrame?.mode ?? "sliding-window";

  if (mode === "full") {
    const latestTransactionMonth = latestTransaction
      ? monthUtils.monthFromDate(latestTransaction)
      : null;
    const currentMonth = monthUtils.currentMonth();
    const fullEnd =
      latestTransactionMonth && monthUtils.isAfter(latestTransactionMonth, currentMonth)
        ? latestTransactionMonth
        : currentMonth;
    return getFullRange(start, fullEnd);
  }
  if (mode === "sliding-window") {
    const offset = monthUtils.differenceInCalendarMonths(end, start);

    if (start > end) {
      return [
        monthUtils.currentMonth(),
        monthUtils.subMonths(monthUtils.currentMonth(), -offset),
        "sliding-window",
      ] as const;
    }

    return getLatestRange(offset);
  }
  if (mode === "lastMonth") {
    const lastMonth = monthUtils.subMonths(monthUtils.currentMonth(), 1);
    return [lastMonth, lastMonth, "lastMonth"] as const;
  }
  if (mode === "lastYear") {
    return [
      monthUtils.getYearStart(monthUtils.prevYear(monthUtils.currentMonth())),
      monthUtils.getYearEnd(monthUtils.prevYear(monthUtils.currentDate())),
      "lastYear",
    ] as const;
  }
  if (mode === "yearToDate") {
    return [monthUtils.currentYear() + "-01", monthUtils.currentMonth(), "yearToDate"] as const;
  }
  if (mode === "priorYearToDate") {
    return [
      monthUtils.getYearStart(monthUtils.prevYear(monthUtils.currentMonth())),
      monthUtils.prevYear(monthUtils.currentDate(), "yyyy-MM-dd"),
      "priorYearToDate",
    ] as const;
  }

  return [start, end, "static"] as const;
}

/**
 * Time range for the Spending report — port of desktop-client
 * `calculateSpendingReportTimeRange`. In `budget`/`average` live modes both
 * bounds collapse to the compare month; `single-month` live uses compare + the
 * prior month; otherwise it defers to {@link calculateTimeRange}.
 */
export function calculateSpendingReportTimeRange({
  compare,
  compareTo,
  isLive = true,
  mode = "single-month",
}: {
  compare?: string;
  compareTo?: string;
  isLive?: boolean;
  mode?: "budget" | "average" | "single-month";
}): [string, string] {
  if (["budget", "average"].includes(mode) && isLive) {
    const month = compare ?? monthUtils.currentMonth();
    return [month, month];
  }

  if (mode === "single-month" && isLive && compare) {
    return [compare, compareTo ?? monthUtils.subMonths(compare, 1)];
  }

  const [start, end] = calculateTimeRange(
    { start: compare, end: compareTo, mode: (isLive ?? true) ? "sliding-window" : "static" },
    {
      start: monthUtils.currentMonth(),
      end: monthUtils.subMonths(monthUtils.currentMonth(), 1),
      mode: "sliding-window",
    },
  );
  return [start, end];
}
