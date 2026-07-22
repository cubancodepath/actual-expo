/**
 * useFirstDayOfWeek — reactive `firstDayOfWeekIdx` (0 = Sunday … 6 = Saturday),
 * mirroring upstream. Consumed by the HeroUI `Calendar` (via {@link weekdayCode})
 * so its week starts on the configured day; reports/other calendars can reuse it
 * when they're migrated.
 */
import { useSyncedPref } from "@/lib/hooks/useSyncedPref";

/** 0 = Sunday … 6 = Saturday (Pikaday numbering). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** HeroUI/`@internationalized/date` weekday code, indexed by {@link WeekdayIndex}. */
export type WeekdayCode = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const WEEKDAY_CODES: WeekdayCode[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Map a 0–6 index to the code HeroUI's `Calendar#firstDayOfWeek` expects. */
export function weekdayCode(idx: WeekdayIndex): WeekdayCode {
  return WEEKDAY_CODES[idx];
}

export function useFirstDayOfWeek(): WeekdayIndex {
  const [pref] = useSyncedPref("firstDayOfWeekIdx");
  const idx = Number(pref);
  return (Number.isInteger(idx) && idx >= 0 && idx <= 6 ? idx : 0) as WeekdayIndex;
}

/**
 * Start of the week containing `date`, respecting the configured first day.
 * Returns a new Date at 00:00 local time.
 */
export function startOfWeek(date: Date, firstDay: WeekdayIndex): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}
