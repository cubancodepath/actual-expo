/**
 * useSchedules — reactive schedules with status computation.
 *
 * Uses AQL liveQuery for schedules (with JOINs to rules + schedules_next_date)
 * and a second liveQuery for linked transactions (status computation).
 * Rows are post-processed to derive _payee, _account, _amount, _date from
 * the rules JSON conditions.
 */

import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import { getStatus } from "@/schedules/helpers";
import { getHasTransactionsQuery, type ScheduleStatuses } from "@/schedules/status";
import { mapScheduleRow } from "@/schedules/mapRow";
import type { Schedule } from "@/schedules/types";

export interface UseSchedulesResult {
  schedules: Schedule[];
  statuses: ScheduleStatuses;
  isLoading: boolean;
}

export function useSchedules(): UseSchedulesResult {
  // 1. LiveQuery for schedules (with rules + next_date JOINs via view)
  const { data: rawRows, isLoading: schedulesLoading } = useLiveQuery<Record<string, unknown>>(
    () => q("schedules").select(["*"]),
    [],
  );

  // 2. Post-process rows: parse JSON conditions, derive _payee/_account/_amount/_date
  const schedules = useMemo(() => (rawRows ?? []).map(mapScheduleRow), [rawRows]);

  // 3. Build query for linked transactions (depends on schedules)
  const hasTransQuery = useMemo(
    () => (schedules.length > 0 ? getHasTransactionsQuery(schedules) : null),
    [schedules],
  );

  // 4. LiveQuery for linked transactions (auto-refreshes on transaction changes)
  const { data: transRows } = useLiveQuery<{ schedule: string; date: string }>(
    () => hasTransQuery,
    [hasTransQuery],
  );

  // 5. Compute statuses (pure derivation)
  const statuses = useMemo<ScheduleStatuses>(() => {
    if (schedules.length === 0) return new Map();
    const hasTrans = new Set((transRows ?? []).map((r) => r.schedule).filter(Boolean));
    return new Map(
      schedules.map((s) => [s.id, getStatus(s.next_date, s.completed, hasTrans.has(s.id))]),
    );
  }, [schedules, transRows]);

  return {
    schedules,
    statuses,
    isLoading: schedulesLoading,
  };
}
