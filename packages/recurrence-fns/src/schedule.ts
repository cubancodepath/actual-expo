import { Rule } from "./rule";
import { OccurrenceStream } from "./stream";
import type { IOccurrenceArgs, IOccurrenceStream, IScheduleArgs } from "./types";

/**
 * A set of recurrence rules, merged into one ascending series with duplicate
 * instants collapsed.
 *
 * `data` is carried through untouched and never interpreted — Actual uses it to
 * park its weekend-skip settings next to the schedule that produced them.
 */
export class Schedule<TData = unknown> {
  readonly data: TData;
  private readonly rules: Rule[];

  constructor(args: IScheduleArgs<TData>) {
    this.rules = (args.rrules ?? []).map((options) => new Rule(options));
    this.data = args.data as TData;
  }

  occurrences(args: IOccurrenceArgs = {}): IOccurrenceStream {
    return new OccurrenceStream(this.rules, args);
  }

  /** Exact-instant match, hours included. */
  occursOn(args: { date: Date }): boolean {
    return this.occurrences({ start: args.date, end: args.date, take: 1 }).toArray().length > 0;
  }

  /** Inclusive on both ends. */
  occursBetween(start: Date, end: Date): boolean {
    return this.occurrences({ start, end, take: 1 }).toArray().length > 0;
  }
}
