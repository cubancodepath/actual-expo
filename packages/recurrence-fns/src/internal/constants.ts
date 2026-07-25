import type { DayOfWeekAbbr } from "../types";

/** Weekday abbreviation → `Date.getDay()` index. */
export const DAY_MAP: Record<DayOfWeekAbbr, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * Consecutive periods a rule may produce no candidate at all before we give up.
 * Covers patterns that are legal but rare ("5th Monday", "the 31st") without
 * letting an impossible one spin forever — on Hermes a hang is an ANR.
 */
export const MAX_EMPTY_PERIODS = 1200;

/** Hard ceiling on results produced by a single drain. */
export const MAX_OCCURRENCES = 100_000;
