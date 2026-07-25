import { addWeeks, differenceInCalendarDays } from "date-fns";
import type { NormalizedRuleOptions } from "../../types";
import { datesForDay, datesForDayReversed, timeOfDay } from "../hours";

/**
 * The series keeps the weekday of `start`. Actual never passes `byDayOfWeek`
 * with WEEKLY (upstream's recurConfigToRSchedule returns the base rule
 * untouched for it), and neither do we — see the README's out-of-scope list.
 */
export function* forward(opts: NormalizedRuleOptions): Generator<Date> {
  const time = timeOfDay(opts);
  for (let i = 0; ; i++) {
    const day = addWeeks(opts.start, i * opts.interval);
    yield* datesForDay(day.getFullYear(), day.getMonth(), day.getDate(), time);
  }
}

export function* backward(opts: NormalizedRuleOptions, from: Date): Generator<Date> {
  const time = timeOfDay(opts);
  const spanWeeks = Math.floor(differenceInCalendarDays(from, opts.start) / 7);
  if (spanWeeks < 0) return;

  for (let i = Math.floor(spanWeeks / opts.interval); i >= 0; i--) {
    const day = addWeeks(opts.start, i * opts.interval);
    yield* datesForDayReversed(day.getFullYear(), day.getMonth(), day.getDate(), time);
  }
}
