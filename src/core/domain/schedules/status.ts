/**
 * Schedule status computation and preview filtering.
 *
 * Ported from Actual Budget's loot-core/src/shared/schedules.ts.
 * Pure functions — no DB access.
 */

import { q } from "@/core/queries";
import type { Query } from "@/core/queries/query";
import type { Schedule, ScheduleStatus } from "@/core/types/models";
import { getScheduleOccurrenceMatchStartDate } from "./posted";

export type ScheduleStatuses = Map<string, ScheduleStatus>;

/**
 * Build an AQL query to find transactions linked to the given schedules.
 * Used to determine "paid" status. The per-schedule date lower bound comes from
 * getScheduleOccurrenceMatchStartDate (accounts for exact/auto-posted/approx).
 */
export function getHasTransactionsQuery(schedules: Schedule[]): Query | null {
  if (schedules.length === 0) return null;

  const filters = schedules
    .filter((s) => s.next_date != null)
    .map((s) => ({
      $and: [
        { schedule: s.id },
        { date: { $gte: getScheduleOccurrenceMatchStartDate(s, s.next_date!) } },
      ],
    }));

  if (filters.length === 0) return null;

  return q("transactions")
    .options({ splits: "all" })
    .filter({ $or: filters })
    .orderBy({ date: "desc" })
    .select(["schedule", "date"]);
}

/**
 * Determine if a schedule should appear as a preview transaction.
 */
export function isForPreview(schedule: Schedule, statuses: ScheduleStatuses): boolean {
  const status = statuses.get(schedule.id);
  return (
    !schedule.completed && status != null && ["due", "upcoming", "missed", "paid"].includes(status)
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
