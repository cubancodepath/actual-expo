/**
 * Public API — the whole surface. Anything not exported here is internal and
 * may change without notice.
 */

export { Schedule } from "./schedule";
export { RecurrenceError } from "./errors";
export type { RecurrenceErrorCode } from "./errors";

export type {
  ByDayOfWeekEntry,
  DayOfWeekAbbr,
  Frequency,
  IOccurrence,
  IOccurrenceArgs,
  IOccurrenceStream,
  IRuleOptions,
  IScheduleArgs,
} from "./types";
