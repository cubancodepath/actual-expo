import { addDays, differenceInCalendarDays } from "date-fns";
import type { NormalizedRuleOptions } from "../../types";
import { datesForDay, datesForDayReversed, timeOfDay } from "../hours";

/** Candidates from `start`, ascending, forever. `count`/`end` are applied by Rule. */
export function* forward(opts: NormalizedRuleOptions): Generator<Date> {
  const time = timeOfDay(opts);
  // Always measured from `start` rather than accumulated, so no drift.
  for (let i = 0; ; i++) {
    const day = addDays(opts.start, i * opts.interval);
    yield* datesForDay(day.getFullYear(), day.getMonth(), day.getDate(), time);
  }
}

/** Candidates at or before `from`, descending, down to `start`. */
export function* backward(opts: NormalizedRuleOptions, from: Date): Generator<Date> {
  const time = timeOfDay(opts);
  const span = differenceInCalendarDays(from, opts.start);
  if (span < 0) return;

  for (let i = Math.floor(span / opts.interval); i >= 0; i--) {
    const day = addDays(opts.start, i * opts.interval);
    yield* datesForDayReversed(day.getFullYear(), day.getMonth(), day.getDate(), time);
  }
}
