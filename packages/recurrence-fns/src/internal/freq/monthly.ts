import { addMonths, differenceInCalendarMonths, getDaysInMonth } from "date-fns";
import type { NormalizedRuleOptions } from "../../types";
import { MAX_EMPTY_PERIODS } from "../constants";
import { datesForDay, datesForDayReversed, timeOfDay } from "../hours";
import { daysForByDayOfMonth, daysForByDayOfWeek } from "../month-pattern";

/**
 * Days this rule lands on within one month, ascending and deduplicated.
 *
 * With no by-rules the series keeps the day-of-month of `start`, and a month
 * that doesn't have that day produces nothing — the month is skipped, not
 * clamped. That is RFC 5545 and what rschedule does: a schedule starting on
 * Jan 31 goes to Mar 31, never Feb 28.
 */
function daysInPeriod(opts: NormalizedRuleOptions, year: number, month: number): number[] {
  if (!opts.byDayOfMonth && !opts.byDayOfWeek) {
    const day = opts.start.getDate();
    return day <= getDaysInMonth(new Date(year, month, 1)) ? [day] : [];
  }

  const days = new Set<number>();
  if (opts.byDayOfMonth) {
    for (const day of daysForByDayOfMonth(opts.byDayOfMonth, year, month)) days.add(day);
  }
  if (opts.byDayOfWeek) {
    for (const day of daysForByDayOfWeek(opts.byDayOfWeek, year, month)) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

export function* forward(opts: NormalizedRuleOptions): Generator<Date> {
  const time = timeOfDay(opts);
  // Periods are anchored to the month of `start`, so `interval` counts from there.
  const anchor = new Date(opts.start.getFullYear(), opts.start.getMonth(), 1);
  let emptyPeriods = 0;

  for (let i = 0; ; i++) {
    const period = addMonths(anchor, i * opts.interval);
    const year = period.getFullYear();
    const month = period.getMonth();
    const days = daysInPeriod(opts, year, month);

    if (days.length === 0) {
      if (++emptyPeriods >= MAX_EMPTY_PERIODS) return;
      continue;
    }
    emptyPeriods = 0;
    for (const day of days) yield* datesForDay(year, month, day, time);
  }
}

export function* backward(opts: NormalizedRuleOptions, from: Date): Generator<Date> {
  const time = timeOfDay(opts);
  const anchor = new Date(opts.start.getFullYear(), opts.start.getMonth(), 1);
  const span = differenceInCalendarMonths(from, anchor);
  if (span < 0) return;

  for (let i = Math.floor(span / opts.interval); i >= 0; i--) {
    const period = addMonths(anchor, i * opts.interval);
    const year = period.getFullYear();
    const month = period.getMonth();

    for (const day of daysInPeriod(opts, year, month).reverse()) {
      yield* datesForDayReversed(year, month, day, time);
    }
  }
}
