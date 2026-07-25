export type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type DayOfWeekAbbr = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

/** `[weekday, nth position in the month]`. The position accepts -1 for "last". */
export type ByDayOfWeekEntry = [DayOfWeekAbbr, number];

export interface IRuleOptions {
  start: Date;
  frequency: Frequency;
  /** Periods between occurrences. Defaults to 1. */
  interval?: number;
  /** Stop after this many occurrences, counted from the start of the series. */
  count?: number;
  /** Last instant an occurrence may fall on. Inclusive. */
  end?: Date;
  /** Hours of the day to place occurrences on. Minutes and below come from `start`. */
  byHourOfDay?: number[];
  /** Days of the month. Negative counts back from the end (-1 = last day). MONTHLY only. */
  byDayOfMonth?: number[];
  /** Nth weekday of the month. MONTHLY only. */
  byDayOfWeek?: ByDayOfWeekEntry[];
}

export interface IOccurrence {
  readonly date: Date;
}

export interface IOccurrenceArgs {
  /** Only yield occurrences at or after this instant. Does not affect `count`. */
  start?: Date;
  /** Only yield occurrences at or before this instant. */
  end?: Date;
  /** Stop after this many results. */
  take?: number;
  /** Iterate descending. Requires a bounded series (see README). */
  reverse?: boolean;
}

export interface IOccurrenceStream extends Iterable<IOccurrence> {
  toArray(): IOccurrence[];
}

export interface IScheduleArgs<TData> {
  rrules: IRuleOptions[];
  data?: TData;
}

/** Rule options with defaults resolved and invariants checked. */
export interface NormalizedRuleOptions {
  start: Date;
  frequency: Frequency;
  interval: number;
  count?: number;
  end?: Date;
  hours: number[];
  byDayOfMonth?: number[];
  byDayOfWeek?: ByDayOfWeekEntry[];
}
