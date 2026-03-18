/**
 * Preview (upcoming) transactions computed from schedules.
 *
 * Mirrors original Actual Budget's computeSchedulePreviewTransactions.
 * Preview transactions appear at the top of account transaction lists
 * so users can see what's coming and take actions (post, skip).
 */

import { addDays, startOfDay } from "date-fns";
import { getSchedules } from "./index";
import { getStatus, getScheduledAmount } from "./helpers";
import { getNextOccurrence, getDateWithSkippedWeekend, parseDate, dayFromDate } from "./recurrence";
import { todayStr, strToInt } from "../lib/date";
import { runQuery } from "../db";
import type { Schedule, RecurConfig, ScheduleStatus } from "./types";
import type { PreviewTransaction } from "./computePreview";

export type { PreviewTransaction } from "./computePreview";

/**
 * Compute upcoming preview transactions for a given account.
 * Returns preview transactions within the upcoming window (default 7 days).
 */
export async function getPreviewTransactionsForAccount(
  accountId: string,
  upcomingDays = 7,
): Promise<PreviewTransaction[]> {
  const schedules = await getSchedules();
  const active = schedules.filter((s) => !s.completed && !s.tombstone && s._account === accountId);

  return buildPreviews(active, upcomingDays);
}

/**
 * Compute upcoming preview transactions across ALL accounts.
 */
export async function getAllPreviewTransactions(upcomingDays = 7): Promise<PreviewTransaction[]> {
  const schedules = await getSchedules();
  const active = schedules.filter((s) => !s.completed && !s.tombstone && s._account != null);

  return buildPreviews(active, upcomingDays);
}

async function buildPreviews(
  active: Schedule[],
  upcomingDays: number,
): Promise<PreviewTransaction[]> {
  if (active.length === 0) return [];

  // Check which schedules have linked transactions
  const hasTrans = await getSchedulesWithTransactions(active);

  // Resolve payee names
  const payeeNames = await getPayeeNames(active);

  const today = startOfDay(new Date());
  const boundary = addDays(today, upcomingDays);

  const previews: PreviewTransaction[] = [];

  for (const schedule of active) {
    const hasLinkedTxn = hasTrans.has(schedule.id);
    const status = getStatus(schedule.next_date, schedule.completed, hasLinkedTxn);

    // Only show upcoming, due, or missed — skip paid/completed
    if (status === "paid" || status === "completed") continue;

    const nextDate = schedule.next_date;
    if (!nextDate) continue;

    // Check if within upcoming window or missed/due
    if (status !== "missed" && status !== "due" && nextDate > dayFromDate(boundary)) {
      continue;
    }

    const dateInt = strToInt(nextDate);
    if (dateInt == null) continue;

    const amount = getScheduledAmount(schedule._amount);
    const isRecurring =
      schedule._date != null && typeof schedule._date === "object" && "frequency" in schedule._date;

    previews.push({
      id: `preview/${schedule.id}/${dateInt}`,
      scheduleId: schedule.id,
      payee: schedule._payee ?? null,
      payeeName: payeeNames.get(schedule._payee ?? "") ?? "(no payee)",
      account: schedule._account ?? null,
      amount,
      date: dateInt,
      dateStr: nextDate,
      status,
      isRecurring,
      forceUpcoming: false,
    });
  }

  // Sort: missed first, then due, then upcoming by date
  const statusOrder: Record<string, number> = {
    missed: 0,
    due: 1,
    upcoming: 2,
    scheduled: 3,
  };

  previews.sort((a, b) => {
    const aOrder = statusOrder[a.status] ?? 9;
    const bOrder = statusOrder[b.status] ?? 9;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.date - b.date;
  });

  return previews;
}

async function getSchedulesWithTransactions(schedules: Schedule[]): Promise<Set<string>> {
  if (schedules.length === 0) return new Set();

  // Build a map of schedule_id → next_date (as int) for date-aware matching
  const dateMap = new Map<string, number>();
  for (const s of schedules) {
    if (s.next_date) {
      const dateInt = strToInt(s.next_date);
      if (dateInt != null) dateMap.set(s.id, dateInt);
    }
  }

  const ids = schedules.map((s) => s.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = await runQuery<{ schedule: string; date: number }>(
    `SELECT schedule, date FROM transactions
     WHERE schedule IN (${placeholders}) AND tombstone = 0`,
    ids,
  );

  // Only mark as "has transaction" if a linked txn matches the schedule's next_date
  const result = new Set<string>();
  for (const r of rows) {
    const nextDate = dateMap.get(r.schedule);
    if (nextDate != null && r.date === nextDate) {
      result.add(r.schedule);
    }
  }
  return result;
}

async function getPayeeNames(schedules: Schedule[]): Promise<Map<string, string>> {
  const payeeIds = [
    ...new Set(schedules.map((s) => s._payee).filter((id): id is string => id != null)),
  ];
  if (payeeIds.length === 0) return new Map();

  const placeholders = payeeIds.map(() => "?").join(",");
  const rows = await runQuery<{ id: string; name: string; transfer_acct: string | null }>(
    `SELECT p.id,
            COALESCE(a.name, p.name) AS name,
            p.transfer_acct
     FROM payees p
     LEFT JOIN accounts a ON p.transfer_acct = a.id AND a.tombstone = 0
     WHERE p.id IN (${placeholders}) AND p.tombstone = 0`,
    payeeIds,
  );

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.id, r.transfer_acct ? `Transfer: ${r.name}` : r.name);
  }
  return map;
}
