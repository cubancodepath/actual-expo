import { getDaysInMonth } from "date-fns";
import type { NormalizedRuleOptions } from "../../types";
import { MAX_EMPTY_PERIODS } from "../constants";
import { datesForDay, datesForDayReversed, timeOfDay } from "../hours";

/**
 * Same month and day as `start`, every `interval` years. A Feb 29 series only
 * emits in leap years — the year is skipped, not clamped to Feb 28, matching
 * rschedule. This is why the date is built explicitly instead of via addYears,
 * which would clamp.
 */
function dayInYear(opts: NormalizedRuleOptions, year: number): number | null {
  const day = opts.start.getDate();
  const month = opts.start.getMonth();
  return day <= getDaysInMonth(new Date(year, month, 1)) ? day : null;
}

export function* forward(opts: NormalizedRuleOptions): Generator<Date> {
  const time = timeOfDay(opts);
  const month = opts.start.getMonth();
  const firstYear = opts.start.getFullYear();
  let emptyPeriods = 0;

  for (let i = 0; ; i++) {
    const year = firstYear + i * opts.interval;
    const day = dayInYear(opts, year);

    if (day === null) {
      if (++emptyPeriods >= MAX_EMPTY_PERIODS) return;
      continue;
    }
    emptyPeriods = 0;
    yield* datesForDay(year, month, day, time);
  }
}

export function* backward(opts: NormalizedRuleOptions, from: Date): Generator<Date> {
  const time = timeOfDay(opts);
  const month = opts.start.getMonth();
  const firstYear = opts.start.getFullYear();
  const span = from.getFullYear() - firstYear;
  if (span < 0) return;

  for (let i = Math.floor(span / opts.interval); i >= 0; i--) {
    const year = firstYear + i * opts.interval;
    const day = dayInYear(opts, year);
    if (day === null) continue;
    yield* datesForDayReversed(year, month, day, time);
  }
}
