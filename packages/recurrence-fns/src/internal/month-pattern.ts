import { getDay, getDaysInMonth } from "date-fns";
import type { ByDayOfWeekEntry } from "../types";
import { DAY_MAP } from "./constants";

function daysInMonth(year: number, month: number): number {
  return getDaysInMonth(new Date(year, month, 1));
}

/**
 * Resolve `byDayOfMonth` values against a concrete month. Negative values count
 * back from the end (-1 = last day). Values that don't exist in the month are
 * dropped — a 31 in February yields nothing, which is what makes the month get
 * skipped rather than clamped.
 */
export function daysForByDayOfMonth(values: number[], year: number, month: number): number[] {
  const total = daysInMonth(year, month);
  const days: number[] = [];

  for (const value of values) {
    const day = value < 0 ? total + 1 + value : value;
    if (day >= 1 && day <= total) days.push(day);
  }
  return days;
}

/**
 * Resolve `byDayOfWeek` entries against a concrete month. `['MO', 2]` is the
 * second Monday; `['FR', -1]` is the last Friday. Positions that don't exist in
 * the month (a 5th Monday, usually) yield nothing.
 */
export function daysForByDayOfWeek(
  entries: ByDayOfWeekEntry[],
  year: number,
  month: number,
): number[] {
  const total = daysInMonth(year, month);
  const days: number[] = [];

  for (const [abbr, position] of entries) {
    const targetDow = DAY_MAP[abbr];
    if (targetDow === undefined) continue;

    if (position < 0) {
      // Walk back from the end of the month, skipping |position| - 1 matches.
      let remaining = -position;
      for (let day = total; day >= 1; day--) {
        if (getDay(new Date(year, month, day)) === targetDow && --remaining === 0) {
          days.push(day);
          break;
        }
      }
      continue;
    }

    let seen = 0;
    for (let day = 1; day <= total; day++) {
      if (getDay(new Date(year, month, day)) === targetDow && ++seen === position) {
        days.push(day);
        break;
      }
    }
  }
  return days;
}
