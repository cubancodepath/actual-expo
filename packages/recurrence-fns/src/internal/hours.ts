import type { NormalizedRuleOptions } from "../types";

export interface TimeOfDay {
  /** Ascending, deduplicated. */
  hours: number[];
  minutes: number;
  seconds: number;
  ms: number;
}

/**
 * `byHourOfDay` sets the hour and leaves everything below it alone — that is how
 * rschedule behaves, and Actual relies on it: it passes `[12]` purely to anchor
 * occurrences at midday so a DST shift can't move them across a date boundary.
 */
export function timeOfDay(opts: NormalizedRuleOptions): TimeOfDay {
  return {
    hours: opts.hours,
    minutes: opts.start.getMinutes(),
    seconds: opts.start.getSeconds(),
    ms: opts.start.getMilliseconds(),
  };
}

/** Every instant a given calendar day produces, ascending. */
export function datesForDay(year: number, month: number, day: number, time: TimeOfDay): Date[] {
  return time.hours.map((h) => new Date(year, month, day, h, time.minutes, time.seconds, time.ms));
}

/** Same, descending — for reverse iteration. */
export function datesForDayReversed(
  year: number,
  month: number,
  day: number,
  time: TimeOfDay,
): Date[] {
  return datesForDay(year, month, day, time).reverse();
}
