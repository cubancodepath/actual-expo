/**
 * Matching posted transactions to schedule occurrences.
 *
 * Ported verbatim from Actual Budget's loot-core/src/shared/schedules.ts. Pure
 * functions — no DB access. Used to decide whether a given schedule occurrence
 * already has a posted transaction (drives "paid" status and forecast dedup).
 */

import { addDays, format } from "date-fns";
import type { RuleCondition } from "./types";

export type ScheduleOccurrenceMatchInput = {
  posts_transaction?: boolean;
  _conditions?: RuleCondition[];
};

export type PostedScheduleTransaction = {
  schedule?: string | null;
  date: string;
};

/** Subtract whole days from a 'YYYY-MM-DD' string (timezone-safe, noon anchor). */
function subDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return format(addDays(new Date(y, m - 1, d, 12, 0, 0), -days), "yyyy-MM-dd");
}

/**
 * Lower bound for matching a posted transaction to a schedule occurrence date.
 *
 * - Exact date condition (`op === 'is'`): match from the occurrence date only.
 * - Auto-posted (`posts_transaction`): exact occurrence date — auto-posted dates
 *   are always precise, so a lookback would let yesterday's transaction falsely
 *   match today's occurrence.
 * - Otherwise (manual recurring with `isapprox`, etc.): 2-day lookback to catch
 *   early payments.
 */
export function getScheduleOccurrenceMatchStartDate(
  schedule: ScheduleOccurrenceMatchInput,
  occurrenceDate: string,
): string {
  const dateCond = schedule._conditions?.find((c) => c.field === "date");
  if (dateCond?.op === "is") {
    return occurrenceDate;
  }
  if (schedule.posts_transaction) {
    return occurrenceDate;
  }
  return subDaysStr(occurrenceDate, 2);
}

/** Group posted schedule transactions by their linked schedule id. */
export function indexPostedScheduleTransactions(
  transactions: PostedScheduleTransaction[],
): Map<string, PostedScheduleTransaction[]> {
  const byScheduleId = new Map<string, PostedScheduleTransaction[]>();

  for (const transaction of transactions) {
    if (!transaction.schedule) {
      continue;
    }

    const existing = byScheduleId.get(transaction.schedule);
    if (existing) {
      existing.push(transaction);
    } else {
      byScheduleId.set(transaction.schedule, [transaction]);
    }
  }

  return byScheduleId;
}

/** Whether a specific schedule occurrence already has a posted transaction. */
export function isScheduleOccurrencePosted({
  schedule,
  scheduleId,
  occurrenceDate,
  postedTransactions,
}: {
  schedule: ScheduleOccurrenceMatchInput;
  scheduleId: string;
  occurrenceDate: string;
  postedTransactions: PostedScheduleTransaction[];
}): boolean {
  const matchStartDate = getScheduleOccurrenceMatchStartDate(schedule, occurrenceDate);

  return postedTransactions.some(
    (tx) => tx.schedule === scheduleId && tx.date >= matchStartDate && tx.date <= occurrenceDate,
  );
}
