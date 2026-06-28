/**
 * Compute preview transactions from schedules + statuses.
 *
 * Ported from Actual Budget's computeSchedulePreviewTransactions.
 * Pure function — no DB access. Takes pre-fetched data and returns
 * preview transaction objects ready for display.
 */

import { addDays, startOfDay } from "date-fns";
import { getScheduledAmount, extractScheduleConds } from "./helpers";
import { getNextOccurrence, dayFromDate, parseDate } from "./recurrence";
import { isForPreview, type ScheduleStatuses } from "./status";
import { todayStr, strToInt } from "@/lib/date";
import type { Schedule, ScheduleStatus } from "./types";

export type PreviewTransaction = {
  id: string;
  scheduleId: string;
  payee: string | null;
  payeeName: string;
  account: string | null;
  accountName: string | null;
  categoryName: string | null;
  amount: number;
  date: number; // YYYYMMDD int
  dateStr: string; // YYYY-MM-DD
  status: ScheduleStatus;
  isRecurring: boolean;
  forceUpcoming: boolean;
};

/**
 * Compute preview transactions for display in transaction lists.
 *
 * @param schedules - All schedules (from liveQuery)
 * @param statuses - Pre-computed status map (from useSchedules hook)
 * @param upcomingDays - How many days ahead to show (default 7)
 * @param filter - Optional filter function (e.g., filter by account)
 */
export function computePreviewTransactions(
  schedules: Schedule[],
  statuses: ScheduleStatuses,
  payeeNames: Map<string, string>,
  categoryNames: Map<string, string>,
  accountNames: Map<string, string>,
  upcomingDays = 7,
  filter?: (schedule: Schedule) => boolean,
): PreviewTransaction[] {
  const forPreview = schedules
    .filter((s) => isForPreview(s, statuses))
    .filter(filter ?? (() => true));

  if (forPreview.length === 0) return [];

  const today = startOfDay(new Date());
  const boundary = addDays(today, upcomingDays);
  const todayString = todayStr();

  const previews: PreviewTransaction[] = [];

  for (const schedule of forPreview) {
    const status = statuses.get(schedule.id)!;
    const conds = extractScheduleConds(schedule._conditions ?? []);
    const isRecurring =
      conds.date != null &&
      typeof conds.date.value === "object" &&
      conds.date.value != null &&
      "frequency" in conds.date.value;

    // Collect dates: start with next_date, expand recurring
    const dates: string[] = [];
    if (schedule.next_date) {
      dates.push(schedule.next_date);

      if (
        isRecurring &&
        conds.date?.value &&
        typeof conds.date.value === "object" &&
        "frequency" in conds.date.value
      ) {
        const recurConfig = conds.date.value as import("./types").RecurConfig;
        let day = parseDate(schedule.next_date);
        while (day <= boundary) {
          const nextDay = getNextOccurrence(recurConfig, day);
          if (!nextDay) break;

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

      previews.push({
        id: `preview/${schedule.id}/${dateInt}`,
        scheduleId: schedule.id,
        payee: schedule._payee,
        payeeName: payeeNames.get(schedule._payee ?? "") ?? "(no payee)",
        account: schedule._account,
        accountName: schedule._account ? (accountNames.get(schedule._account) ?? null) : null,
        categoryName: schedule._category ? (categoryNames.get(schedule._category) ?? null) : null,
        amount,
        date: dateInt,
        dateStr,
        status:
          dateStr !== schedule.next_date || status === "paid"
            ? dateStr >= todayString
              ? "upcoming"
              : status
            : status,
        isRecurring,
        forceUpcoming:
          (dateStr !== schedule.next_date || status === "paid") && dateStr >= todayString,
      });
    }
  }

  // Sort by date descending, then amount
  previews.sort((a, b) => b.date - a.date || a.amount - b.amount);

  return previews;
}
