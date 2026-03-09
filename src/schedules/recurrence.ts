/**
 * Recurrence engine — pure date-fns replacement for @rschedule/core.
 *
 * Generates occurrence dates from a RecurConfig, matching the behavior
 * of Actual Budget's original RSchedule-based implementation.
 */

import {
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfDay,
  isWeekend,
  nextMonday,
  previousFriday,
  getDay,
  getDate,
  setDate,
  lastDayOfMonth,
  isBefore,
  isAfter,
  isEqual,
  format,
  getDaysInMonth,
} from 'date-fns';
import type { RecurConfig, RecurPattern } from './types';

// ─── Date Helpers ──────────────────────────────────────────

/** Parse 'YYYY-MM-DD' to Date at noon (avoids timezone issues). */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Format Date as 'YYYY-MM-DD'. */
export function dayFromDate(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Shift a date to skip weekends per the solve mode. */
export function getDateWithSkippedWeekend(
  date: Date,
  solveMode: 'before' | 'after',
): Date {
  if (isWeekend(date)) {
    return solveMode === 'after' ? nextMonday(date) : previousFriday(date);
  }
  return date;
}

// ─── Day-of-week map ───────────────────────────────────────

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

// ─── Monthly Pattern Resolution ────────────────────────────

/**
 * Resolve a monthly pattern to actual day(s) in a given month.
 * Returns array of day-of-month values (1-based).
 */
function resolveMonthlyPattern(
  pattern: RecurPattern,
  year: number,
  month: number, // 0-based
): number[] {
  const daysInMonth = getDaysInMonth(new Date(year, month, 1));

  if (pattern.type === 'day') {
    // { type: 'day', value: N } → Nth day of month
    // value -1 means last day
    if (pattern.value === -1) {
      return [daysInMonth];
    }
    if (pattern.value > 0 && pattern.value <= daysInMonth) {
      return [pattern.value];
    }
    return [];
  }

  // Day-of-week pattern: { type: 'MO', value: 2 } → 2nd Monday
  const targetDow = DAY_MAP[pattern.type];
  if (targetDow === undefined) return [];

  if (pattern.value === -1) {
    // Last occurrence of that day in the month
    let day = daysInMonth;
    while (day >= 1) {
      const d = new Date(year, month, day, 12);
      if (getDay(d) === targetDow) return [day];
      day--;
    }
    return [];
  }

  // Nth occurrence (1-based)
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day, 12);
    if (getDay(d) === targetDow) {
      count++;
      if (count === pattern.value) return [day];
    }
  }
  return [];
}

// ─── Occurrence Generator ──────────────────────────────────

/**
 * Iterate candidate dates from a RecurConfig starting at or after `after`.
 * Yields raw dates WITHOUT weekend skipping applied.
 */
function* generateOccurrences(
  config: RecurConfig,
  after: Date,
): Generator<Date> {
  const interval = config.interval ?? 1;
  const start = parseDate(config.start);

  // End condition helpers
  const endDate = config.endDate ? parseDate(config.endDate) : null;
  const maxCount =
    config.endMode === 'after_n_occurrences' ? config.endOccurrences ?? Infinity : Infinity;

  let occurrenceCount = 0;

  switch (config.frequency) {
    case 'daily': {
      // Find first candidate >= after
      let current = new Date(start);
      if (isBefore(current, after)) {
        const diffMs = after.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / (86400 * 1000));
        const periodsSkipped = Math.floor(diffDays / interval);
        current = addDays(start, periodsSkipped * interval);
        if (isBefore(current, after)) current = addDays(current, interval);
      }
      // Count occurrences from start to current
      const msFromStart = current.getTime() - start.getTime();
      occurrenceCount = Math.round(msFromStart / (86400 * 1000 * interval));

      while (true) {
        if (occurrenceCount >= maxCount) return;
        if (endDate && isAfter(current, endDate)) return;
        if (!isBefore(current, after)) yield current;
        current = addDays(current, interval);
        occurrenceCount++;
      }
    }

    case 'weekly': {
      let current = new Date(start);
      if (isBefore(current, after)) {
        const diffMs = after.getTime() - start.getTime();
        const diffWeeks = Math.floor(diffMs / (7 * 86400 * 1000));
        const periodsSkipped = Math.floor(diffWeeks / interval);
        current = addWeeks(start, periodsSkipped * interval);
        if (isBefore(current, after)) current = addWeeks(current, interval);
      }
      const msFromStart = current.getTime() - start.getTime();
      occurrenceCount = Math.round(msFromStart / (7 * 86400 * 1000 * interval));

      while (true) {
        if (occurrenceCount >= maxCount) return;
        if (endDate && isAfter(current, endDate)) return;
        if (!isBefore(current, after)) yield current;
        current = addWeeks(current, interval);
        occurrenceCount++;
      }
    }

    case 'monthly': {
      const hasPatterns = config.patterns && config.patterns.length > 0;

      if (hasPatterns) {
        // With patterns: iterate months and resolve patterns
        let monthOffset = 0;
        const startYear = start.getFullYear();
        const startMonth = start.getMonth();

        // Find starting month offset
        if (isBefore(start, after)) {
          const afterYear = after.getFullYear();
          const afterMonth = after.getMonth();
          const totalMonthsDiff =
            (afterYear - startYear) * 12 + (afterMonth - startMonth);
          monthOffset =
            Math.floor(totalMonthsDiff / interval) * interval;
        }

        while (true) {
          const candidateDate = addMonths(
            new Date(startYear, startMonth, 1, 12),
            monthOffset,
          );
          const year = candidateDate.getFullYear();
          const month = candidateDate.getMonth();

          // Resolve all patterns for this month
          const days: number[] = [];
          for (const pattern of config.patterns!) {
            days.push(...resolveMonthlyPattern(pattern, year, month));
          }
          days.sort((a, b) => a - b);

          for (const day of days) {
            const date = new Date(year, month, day, 12);
            if (occurrenceCount >= maxCount) return;
            if (endDate && isAfter(date, endDate)) return;
            if (!isBefore(date, after)) {
              yield date;
            }
            occurrenceCount++;
          }

          monthOffset += interval;
          // Safety: don't iterate forever
          if (monthOffset > 12000) return; // ~1000 years
        }
      } else {
        // No patterns: same day-of-month as start
        const targetDay = getDate(start);
        let current = new Date(start);

        if (isBefore(current, after)) {
          const startYear = start.getFullYear();
          const startMonth = start.getMonth();
          const afterYear = after.getFullYear();
          const afterMonth = after.getMonth();
          const totalMonthsDiff =
            (afterYear - startYear) * 12 + (afterMonth - startMonth);
          const periodsSkipped =
            Math.floor(totalMonthsDiff / interval) * interval;
          current = addMonths(start, periodsSkipped);
          // Clamp to target day
          const daysInCurrent = getDaysInMonth(current);
          current = setDate(current, Math.min(targetDay, daysInCurrent));
          if (isBefore(current, after)) {
            current = addMonths(start, periodsSkipped + interval);
            const d2 = getDaysInMonth(current);
            current = setDate(current, Math.min(targetDay, d2));
          }
        }

        const msPerMonth = 30.44 * 86400 * 1000;
        const msFromStart = current.getTime() - start.getTime();
        occurrenceCount = Math.round(msFromStart / (msPerMonth * interval));

        while (true) {
          if (occurrenceCount >= maxCount) return;
          if (endDate && isAfter(current, endDate)) return;
          if (!isBefore(current, after)) yield current;
          const nextMonth = addMonths(
            new Date(
              start.getFullYear(),
              start.getMonth(),
              1,
              12,
            ),
            (occurrenceCount + 1) * interval,
          );
          const daysInNext = getDaysInMonth(nextMonth);
          current = new Date(
            nextMonth.getFullYear(),
            nextMonth.getMonth(),
            Math.min(targetDay, daysInNext),
            12,
          );
          occurrenceCount++;
        }
      }
    }

    case 'yearly': {
      let current = new Date(start);
      if (isBefore(current, after)) {
        const diffYears = after.getFullYear() - start.getFullYear();
        const periodsSkipped = Math.floor(diffYears / interval) * interval;
        current = addYears(start, periodsSkipped);
        if (isBefore(current, after)) current = addYears(current, interval);
      }
      occurrenceCount = Math.round(
        (current.getFullYear() - start.getFullYear()) / interval,
      );

      while (true) {
        if (occurrenceCount >= maxCount) return;
        if (endDate && isAfter(current, endDate)) return;
        if (!isBefore(current, after)) yield current;
        current = addYears(start, (occurrenceCount + 1) * interval);
        occurrenceCount++;
      }
    }
  }
}

// ─── Public API ────────────────────────────────────────────

/**
 * Get the next occurrence date from a RecurConfig, at or after `after`.
 * Returns null if no more occurrences exist.
 */
export function getNextOccurrence(
  config: RecurConfig,
  after: Date,
): Date | null {
  const gen = generateOccurrences(config, after);
  const result = gen.next();
  return result.done ? null : result.value;
}

/**
 * Get the next N upcoming dates from a RecurConfig.
 */
export function getUpcomingDates(
  config: RecurConfig,
  count: number,
  after?: Date,
): Date[] {
  const start = after ?? startOfDay(new Date());
  const gen = generateOccurrences(config, start);
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    const result = gen.next();
    if (result.done) break;
    dates.push(result.value);
  }
  return dates;
}

/**
 * Check if a recurrence has any occurrence between start and end (inclusive).
 */
export function occursBetween(
  config: RecurConfig,
  start: Date,
  end: Date,
): boolean {
  const gen = generateOccurrences(config, start);
  const result = gen.next();
  if (result.done) return false;
  return !isAfter(result.value, end);
}

/**
 * Get the last occurrence of a (finite) recurrence.
 * Returns null for infinite recurrences or if no occurrences.
 */
export function getLastOccurrence(config: RecurConfig): Date | null {
  if (!config.endMode || config.endMode === 'never') return null;

  const start = parseDate(config.start);
  const gen = generateOccurrences(config, start);
  let last: Date | null = null;
  for (const date of gen) {
    last = date;
  }
  return last;
}
