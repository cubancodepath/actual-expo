/**
 * monthUtils — string-based date helpers, a faithful port of Actual Budget's
 * loot-core `shared/months.ts`.
 *
 * This is the API the report/dashboard spreadsheets are written against
 * (`monthUtils.rangeInclusive`, `monthUtils.getMonth`, `monthUtils.subMonths`, …).
 * It works with `"YYYY-MM"` month strings and `"YYYY-MM-DD"` day strings and
 * always parses at the 12th hour of the day to stay DST-safe (see `_parse`).
 *
 * NOTE: this coexists with the int-based {@link ./months.ts} used by the rest of
 * the app (which stores dates as `YYYYMMDD` integers). Keep report code on this
 * module — matching upstream — and app/budget code on `months.ts`. In particular
 * `sheetForMonth` here mirrors upstream (`"budget202603"`); the budget spreadsheet
 * engine uses the dashed form from `months.ts`, so do not use this one for
 * spreadsheet-cell lookups.
 */

import * as d from "date-fns";
import type { Locale } from "date-fns";

type DateLike = string | Date;
type Day = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Mirrors SyncedPrefs['firstDayOfWeekIdx'] — "0".."6" (Sunday-indexed). */
type FirstDayOfWeekIdx = string | undefined;

export function _parse(value: DateLike): Date {
  if (typeof value === "string") {
    // Always build the Date from integer parts at the 12th hour so DST shifts
    // (which never exceed 12h) can't bump us into an adjacent day. See the long
    // explanation in the upstream source this is ported from.
    const [year, month, day] = value.split("-");
    if (day != null) {
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12);
    } else if (month != null) {
      return new Date(parseInt(year), parseInt(month) - 1, 1, 12);
    } else {
      return new Date(parseInt(year), 0, 1, 12);
    }
  }
  return value;
}

export const parseDate = _parse;

export function yearFromDate(date: DateLike): string {
  return d.format(_parse(date), "yyyy");
}

export function monthFromDate(date: DateLike): string {
  return d.format(_parse(date), "yyyy-MM");
}

export function isValidYearMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function weekFromDate(date: DateLike, firstDayOfWeekIdx: FirstDayOfWeekIdx): string {
  const converted = parseInt(firstDayOfWeekIdx || "0") as Day;
  return d.format(_parse(d.startOfWeek(_parse(date), { weekStartsOn: converted })), "yyyy-MM-dd");
}

export function firstDayOfMonth(date: DateLike): string {
  return dayFromDate(d.startOfMonth(_parse(date)));
}

export function lastDayOfMonth(date: DateLike): string {
  return dayFromDate(d.endOfMonth(_parse(date)));
}

export function dayFromDate(date: DateLike): string {
  return d.format(_parse(date), "yyyy-MM-dd");
}

export function currentMonth(): string {
  return d.format(new Date(), "yyyy-MM");
}

export function currentWeek(firstDayOfWeekIdx?: FirstDayOfWeekIdx): string {
  const converted = parseInt(firstDayOfWeekIdx || "0") as Day;
  return d.format(_parse(d.startOfWeek(new Date(), { weekStartsOn: converted })), "yyyy-MM-dd");
}

export function currentYear(): string {
  return d.format(new Date(), "yyyy");
}

export function currentDate(): Date {
  return new Date();
}

export function currentDay(): string {
  return d.format(new Date(), "yyyy-MM-dd");
}

export function nextMonth(month: DateLike): string {
  return d.format(d.addMonths(_parse(month), 1), "yyyy-MM");
}

export function prevYear(month: DateLike, format = "yyyy-MM"): string {
  return d.format(d.subMonths(_parse(month), 12), format);
}

export function prevMonth(month: DateLike): string {
  return d.format(d.subMonths(_parse(month), 1), "yyyy-MM");
}

export function addYears(year: DateLike, n: number): string {
  return d.format(d.addYears(_parse(year), n), "yyyy");
}

export function addMonths(month: DateLike, n: number): string {
  return d.format(d.addMonths(_parse(month), n), "yyyy-MM");
}

export function addWeeks(date: DateLike, n: number): string {
  return d.format(d.addWeeks(_parse(date), n), "yyyy-MM-dd");
}

export function differenceInCalendarMonths(month1: DateLike, month2: DateLike): number {
  return d.differenceInCalendarMonths(_parse(month1), _parse(month2));
}

export function differenceInCalendarDays(month1: DateLike, month2: DateLike): number {
  return d.differenceInCalendarDays(_parse(month1), _parse(month2));
}

export function subMonths(month: DateLike, n: number): string {
  return d.format(d.subMonths(_parse(month), n), "yyyy-MM");
}

export function subWeeks(date: DateLike, n: number): string {
  return d.format(d.subWeeks(_parse(date), n), "yyyy-MM-dd");
}

export function subYears(year: DateLike, n: number): string {
  return d.format(d.subYears(_parse(year), n), "yyyy");
}

export function addDays(day: DateLike, n: number): string {
  return d.format(d.addDays(_parse(day), n), "yyyy-MM-dd");
}

export function subDays(day: DateLike, n: number): string {
  return d.format(d.subDays(_parse(day), n), "yyyy-MM-dd");
}

export function isBefore(month1: DateLike, month2: DateLike): boolean {
  return d.isBefore(_parse(month1), _parse(month2));
}

export function isAfter(month1: DateLike, month2: DateLike): boolean {
  return d.isAfter(_parse(month1), _parse(month2));
}

export function isCurrentMonth(month: DateLike): boolean {
  return month === currentMonth();
}

export function isCurrentDay(day: DateLike): boolean {
  return day === currentDay();
}

export function bounds(month: DateLike): { start: number; end: number } {
  return {
    start: parseInt(d.format(d.startOfMonth(_parse(month)), "yyyyMMdd")),
    end: parseInt(d.format(d.endOfMonth(_parse(month)), "yyyyMMdd")),
  };
}

export function _yearRange(start: DateLike, end: DateLike, inclusive = false): string[] {
  const years: string[] = [];
  let year = yearFromDate(start);
  const endYear = yearFromDate(end);
  while (d.isBefore(_parse(year), _parse(endYear))) {
    years.push(year);
    year = addYears(year, 1);
  }
  if (inclusive) years.push(year);
  return years;
}

export function yearRangeInclusive(start: DateLike, end: DateLike): string[] {
  return _yearRange(start, end, true);
}

export function _weekRange(
  start: DateLike,
  end: DateLike,
  inclusive = false,
  firstDayOfWeekIdx?: FirstDayOfWeekIdx,
): string[] {
  const weeks: string[] = [];
  let week = weekFromDate(start, firstDayOfWeekIdx);
  const endWeek = weekFromDate(end, firstDayOfWeekIdx);
  while (d.isBefore(_parse(week), _parse(endWeek))) {
    weeks.push(week);
    week = addWeeks(week, 1);
  }
  if (inclusive) weeks.push(week);
  return weeks;
}

export function weekRangeInclusive(
  start: DateLike,
  end: DateLike,
  firstDayOfWeekIdx?: FirstDayOfWeekIdx,
): string[] {
  return _weekRange(start, end, true, firstDayOfWeekIdx);
}

export function _range(start: DateLike, end: DateLike, inclusive = false): string[] {
  const months: string[] = [];
  let month = monthFromDate(start);
  const endMonth = monthFromDate(end);
  while (d.isBefore(_parse(month), _parse(endMonth))) {
    months.push(month);
    month = addMonths(month, 1);
  }
  if (inclusive) months.push(month);
  return months;
}

export function range(start: DateLike, end: DateLike): string[] {
  return _range(start, end);
}

export function rangeInclusive(start: DateLike, end: DateLike): string[] {
  return _range(start, end, true);
}

export function _dayRange(start: DateLike, end: DateLike, inclusive = false): string[] {
  const days: string[] = [];
  let day: DateLike = start;
  while (d.isBefore(_parse(day), _parse(end))) {
    days.push(dayFromDate(day));
    day = addDays(day, 1);
  }
  if (inclusive) days.push(dayFromDate(day));
  return days;
}

export function dayRange(start: DateLike, end: DateLike): string[] {
  return _dayRange(start, end);
}

export function dayRangeInclusive(start: DateLike, end: DateLike): string[] {
  return _dayRange(start, end, true);
}

export function getMonthFromIndex(year: string, monthIndex: number): string {
  const formatMonth = `${monthIndex + 1}`.padStart(2, "0");
  return `${year}-${formatMonth}`;
}

export function getMonthIndex(month: string): number {
  return parseInt(month.slice(5, 7)) - 1;
}

export function getYear(month: string): string {
  return month.slice(0, 4);
}

export function getMonth(day: string): string {
  return day.slice(0, 7);
}

export function getDay(day: string): number {
  return Number(d.format(_parse(day), "dd"));
}

export function getMonthEnd(day: string): string {
  return subDays(nextMonth(day.slice(0, 7)) + "-01", 1);
}

export function getWeekEnd(date: DateLike, firstDayOfWeekIdx?: FirstDayOfWeekIdx): string {
  const converted = parseInt(firstDayOfWeekIdx || "0") as Day;
  return d.format(_parse(d.endOfWeek(_parse(date), { weekStartsOn: converted })), "yyyy-MM-dd");
}

export function getYearStart(month: string): string {
  return getYear(month) + "-01";
}

export function getYearEnd(month: string): string {
  return getYear(month) + "-12";
}

/** Upstream form ("budget202603"). Reports use `getBudgetMonth`, not sheet cells;
 *  do not use for the budget spreadsheet engine (which keys "budget2026-03"). */
export function sheetForMonth(month: string): string {
  return "budget" + month.replace("-", "");
}

export function nameForMonth(month: DateLike, locale?: Locale): string {
  return d.format(_parse(month), "MMMM ''yy", { locale });
}

export function format(month: DateLike, formatStr: string, locale?: Locale): string {
  return d.format(_parse(month), formatStr, { locale });
}

export function formatDistance(
  date1: DateLike,
  date2: DateLike,
  locale?: Locale,
  options?: { addSuffix?: boolean; includeSeconds?: boolean },
): string {
  return d.formatDistance(_parse(date1), _parse(date2), { locale, ...options });
}
