/**
 * useSchedules — reactive schedules with status computation.
 *
 * Ported from Actual Budget's useCachedSchedules pattern:
 * 1. LiveQuery for schedules (auto-refreshes on schedule changes)
 * 2. LiveQuery for linked transactions (auto-refreshes on transaction changes)
 * 3. Statuses derived via useMemo (pure computation)
 *
 * No store needed — data is reactive via liveQuery + syncEvents.
 */

import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import { getStatus } from "@/schedules/helpers";
import { getHasTransactionsQuery, type ScheduleStatuses } from "@/schedules/status";
import type { Schedule } from "@/schedules/types";

export interface UseSchedulesResult {
  schedules: Schedule[];
  statuses: ScheduleStatuses;
  isLoading: boolean;
}

export function useSchedules(): UseSchedulesResult {
  // 1. LiveQuery for all active schedules
  const { data: schedules, isLoading: schedulesLoading } = useLiveQuery<Schedule>(
    () => q("schedules"),
    [],
  );

  // 2. Build query for linked transactions (depends on schedules)
  const hasTransQuery = useMemo(
    () => (schedules && schedules.length > 0 ? getHasTransactionsQuery(schedules) : null),
    [schedules],
  );

  // 3. LiveQuery for linked transactions (auto-refreshes on transaction changes)
  const { data: transRows } = useLiveQuery<{ schedule: string; date: string }>(
    () => hasTransQuery,
    [hasTransQuery],
  );

  // 4. Compute statuses (pure derivation)
  const statuses = useMemo<ScheduleStatuses>(() => {
    if (!schedules) return new Map();
    const hasTrans = new Set(
      (transRows ?? []).map((r) => r.schedule).filter(Boolean),
    );
    return new Map(
      schedules.map((s) => [
        s.id,
        getStatus(s.next_date, s.completed, hasTrans.has(s.id)),
      ]),
    );
  }, [schedules, transRows]);

  return {
    schedules: schedules ?? [],
    statuses,
    isLoading: schedulesLoading,
  };
}
