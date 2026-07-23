/**
 * Compute preview transactions from schedules + statuses.
 *
 * Ported from Actual Budget's computeSchedulePreviewTransactions.
 * Pure function — no DB access. Takes pre-fetched data and returns
 * preview transaction objects ready for display.
 */

import { addDays, startOfDay } from "date-fns";
import {
  getScheduledAmount,
  extractScheduleConds,
  getUpcomingDays,
  scheduleIsRecurring,
} from "./helpers";
import { getNextOccurrence, applySkipWeekend, dayFromDate, parseDate } from "./recurrence";
import { isForPreview, type ScheduleStatuses } from "./status";
import { todayStr, strToInt } from "@/lib/date";
import type { Schedule, ScheduleStatus, RecurConfig } from "@/core/types/models";

export type PreviewSubtransaction = {
  id: string;
  amount: number;
  category: string | null;
  categoryName: string | null;
};

export type PreviewTransaction = {
  id: string;
  scheduleId: string;
  payee: string | null;
  payeeName: string;
  account: string | null;
  accountName: string | null;
  category?: string | null;
  categoryName: string | null;
  amount: number;
  date: number; // YYYYMMDD int
  dateStr: string; // YYYY-MM-DD
  status: ScheduleStatus;
  isRecurring: boolean;
  forceUpcoming: boolean;
  /** Present when the schedule's rule splits the amount across categories. */
  subtransactions?: PreviewSubtransaction[];
};

/**
 * Compute preview transactions for display in transaction lists.
 *
 * Ported from Actual's computeSchedulePreviewTransactions: expands recurring
 * schedules up to a per-schedule upcoming window (`custom_upcoming_length ??
 * upcomingLength`), drops the first occurrence when already paid, and marks
 * future/paid occurrences `forceUpcoming`.
 *
 * @param upcomingLength - Global upcoming-length pref string (e.g. "7", "oneMonth").
 * @param filter - Optional filter (e.g. by account).
 */
export function computePreviewTransactions(
  schedules: Schedule[],
  statuses: ScheduleStatuses,
  payeeNames: Map<string, string>,
  categoryNames: Map<string, string>,
  accountNames: Map<string, string>,
  upcomingLength = "7",
  filter?: (schedule: Schedule) => boolean,
): PreviewTransaction[] {
  const forPreview = schedules
    .filter((s) => isForPreview(s, statuses))
    .filter(filter ?? (() => true));

  if (forPreview.length === 0) return [];

  const today = startOfDay(new Date());
  const todayString = todayStr();

  const previews: PreviewTransaction[] = [];

  for (const schedule of forPreview) {
    const status = statuses.get(schedule.id)!;
    const conds = extractScheduleConds(schedule._conditions ?? []);
    const isRecurring = scheduleIsRecurring(conds.date);

    // Per-schedule upcoming window (custom overrides the global pref).
    const effectiveUpcomingLength = schedule.custom_upcoming_length ?? upcomingLength;
    const boundary = addDays(today, getUpcomingDays(effectiveUpcomingLength, todayString));

    // Collect dates: start with next_date, expand recurring up to the boundary.
    const dates: string[] = [];
    if (schedule.next_date) {
      dates.push(schedule.next_date);

      if (isRecurring && conds.date?.value) {
        const recurConfig = conds.date.value as RecurConfig;
        let day = parseDate(schedule.next_date);
        while (day <= boundary) {
          const rawNext = getNextOccurrence(recurConfig, day);
          if (!rawNext) break;

          // Apply the weekend-skip rule (Actual expands via getNextDate, which
          // adjusts the date), then advance past the adjusted date.
          const nextDay = applySkipWeekend(recurConfig, rawNext);
          if (startOfDay(nextDay) > boundary) break;

          const nextDateStr = dayFromDate(nextDay);
          if (!dates.includes(nextDateStr)) {
            dates.push(nextDateStr);
          }

          day = addDays(nextDay, 1);
        }
      }
    }

    // If status is "paid", remove the first date (already posted)
    if (status === "paid" && dates.length > 0) {
      dates.shift();
    }

    // Create a preview for each date
    const amount = getScheduledAmount(schedule._amount);

    for (const dateStr of dates) {
      const dateInt = strToInt(dateStr);
      if (dateInt == null) continue;

      const forceUpcoming =
        (dateStr !== schedule.next_date || status === "paid") && dateStr >= todayString;

      previews.push({
        // Match Actual's id format: preview/<scheduleId>/<YYYY-MM-DD>.
        id: `preview/${schedule.id}/${dateStr}`,
        scheduleId: schedule.id,
        payee: schedule._payee,
        payeeName: payeeNames.get(schedule._payee ?? "") ?? "(no payee)",
        account: schedule._account,
        accountName: schedule._account ? (accountNames.get(schedule._account) ?? null) : null,
        category: schedule._category,
        categoryName: schedule._category ? (categoryNames.get(schedule._category) ?? null) : null,
        amount,
        date: dateInt,
        dateStr,
        status: forceUpcoming ? "upcoming" : status,
        isRecurring,
        forceUpcoming,
      });
    }
  }

  // Sort by date descending, then amount
  previews.sort((a, b) => b.date - a.date || a.amount - b.amount);

  return previews;
}
