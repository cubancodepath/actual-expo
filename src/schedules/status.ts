/**
 * Schedule status computation and preview filtering.
 *
 * Ported from Actual Budget's loot-core/src/shared/schedules.ts.
 * Pure functions — no DB access.
 */

import { q } from "@/queries";
import type { Query } from "@/queries/query";
import type { Schedule, ScheduleStatus } from "./types";
import { extractScheduleConds } from "./helpers";

export type ScheduleStatuses = Map<string, ScheduleStatus>;

/**
 * Build an AQL query to find transactions linked to the given schedules.
 * Used to determine "paid" status.
 */
export function getHasTransactionsQuery(schedules: Schedule[]): Query | null {
  if (schedules.length === 0) return null;

  const filters = schedules
    .filter((s) => s.next_date != null)
    .map((s) => {
      const conds = extractScheduleConds(s._conditions ?? []);
      const dateCond = conds.date;

      // If the schedule has an exact date condition, match from that date.
      // Otherwise, look 2 days before next_date (for approximate dates).
      const dateFrom =
        dateCond && dateCond.op === "is" ? s.next_date! : subtractDays(s.next_date!, 2);

      return {
        $and: [{ schedule: s.id }, { date: { $gte: dateFrom } }],
      };
    });

  if (filters.length === 0) return null;

  return q("transactions")
    .options({ splits: "all" })
    .filter({ $or: filters })
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
