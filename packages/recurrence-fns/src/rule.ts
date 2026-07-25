import { RecurrenceError } from "./errors";
import { MAX_OCCURRENCES } from "./internal/constants";
import * as daily from "./internal/freq/daily";
import * as monthly from "./internal/freq/monthly";
import * as weekly from "./internal/freq/weekly";
import * as yearly from "./internal/freq/yearly";
import type { Frequency, IRuleOptions, NormalizedRuleOptions } from "./types";

const GENERATORS = {
  DAILY: daily,
  WEEKLY: weekly,
  MONTHLY: monthly,
  YEARLY: yearly,
} satisfies Record<Frequency, unknown>;

function invalid(message: string): never {
  throw new RecurrenceError("invalid-options", message);
}

export function normalizeRuleOptions(options: IRuleOptions): NormalizedRuleOptions {
  const { start, frequency } = options;

  if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
    invalid("`start` must be a valid Date");
  }
  if (!(frequency in GENERATORS)) {
    invalid(`Unknown frequency: ${String(frequency)}`);
  }

  const interval = options.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) {
    invalid("`interval` must be a positive integer");
  }
  if (options.count != null && (!Number.isInteger(options.count) || options.count < 0)) {
    invalid("`count` must be a non-negative integer");
  }
  if (options.end != null && Number.isNaN(options.end.getTime())) {
    invalid("`end` must be a valid Date");
  }

  const byDayOfMonth = options.byDayOfMonth?.length ? options.byDayOfMonth : undefined;
  const byDayOfWeek = options.byDayOfWeek?.length ? options.byDayOfWeek : undefined;
  if ((byDayOfMonth || byDayOfWeek) && frequency !== "MONTHLY") {
    // Deliberately narrower than rschedule: Actual only ever combines these with
    // MONTHLY, and supporting the rest would be untested surface.
    invalid("`byDayOfMonth` and `byDayOfWeek` are only supported with MONTHLY");
  }
  if (byDayOfMonth?.some((d) => !Number.isInteger(d) || d === 0 || d < -31 || d > 31)) {
    invalid("`byDayOfMonth` values must be non-zero integers between -31 and 31");
  }

  const hours = [...new Set(options.byHourOfDay ?? [start.getHours()])].sort((a, b) => a - b);
  if (hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) {
    invalid("`byHourOfDay` values must be integers between 0 and 23");
  }

  return {
    start,
    frequency,
    interval,
    count: options.count,
    end: options.end,
    hours,
    byDayOfMonth,
    byDayOfWeek,
  };
}

/**
 * One recurrence rule. Termination (`count`, `end`) lives here rather than in
 * Schedule, because rschedule applies both per rule — a Schedule holding two
 * rrules where one is capped at 2 occurrences keeps emitting from the other.
 */
export class Rule {
  readonly options: NormalizedRuleOptions;

  constructor(options: IRuleOptions) {
    this.options = normalizeRuleOptions(options);
  }

  /** True when the rule terminates on its own, so it can be walked in reverse. */
  get isBounded(): boolean {
    return this.options.count != null || this.options.end != null;
  }

  *forward(): Generator<Date> {
    const { start, end, count } = this.options;
    let emitted = 0;

    for (const date of GENERATORS[this.options.frequency].forward(this.options)) {
      if (date < start) continue;
      if (end && date > end) return;
      // Counting real emissions, never estimating from elapsed time: month
      // lengths and DST make any arithmetic shortcut drift by an occurrence.
      if (count != null && emitted >= count) return;
      emitted++;
      yield date;
    }
  }

  /**
   * Occurrences at or before `bound`, descending. Needs the series to terminate:
   * either the rule is bounded, or the caller supplies an upper bound.
   */
  *backward(bound?: Date): Generator<Date> {
    const { start, end, count } = this.options;
    const upper = end && bound ? (end < bound ? end : bound) : (end ?? bound);

    if (count != null) {
      // `count` caps the series length, so materialising it is safe and is the
      // only way to know where it ends.
      const all: Date[] = [];
      for (const date of this.forward()) {
        all.push(date);
        if (all.length > MAX_OCCURRENCES) {
          throw new RecurrenceError("iteration-limit", `Exceeded ${MAX_OCCURRENCES} occurrences`);
        }
      }
      for (let i = all.length - 1; i >= 0; i--) {
        if (upper && all[i] > upper) continue;
        yield all[i];
      }
      return;
    }

    if (!upper) {
      throw new RecurrenceError(
        "unbounded-reverse",
        "When iterating in reverse, the rule must have an 'end' or 'count' property or you must provide an 'end' argument.",
      );
    }

    for (const date of GENERATORS[this.options.frequency].backward(this.options, upper)) {
      if (date > upper) continue;
      if (date < start) return;
      yield date;
    }
  }
}
