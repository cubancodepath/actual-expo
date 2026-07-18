/**
 * Map of scheduleId → whether that schedule recurs, for the ledger's
 * schedule indicator (recurring vs one-time icon on linked transactions).
 * Refreshed on schedule/rule sync events.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@/core/sync/syncEvents";
import { getSchedules } from "@/core/domain/schedules";

const SYNC_TABLES = new Set(["schedules", "schedules_next_date", "rules"]);

/** True when a schedule's date is a recurrence config (has a frequency). */
function isRecurring(date: unknown): boolean {
  return typeof date === "object" && date != null && "frequency" in date;
}

export function useScheduleRecurringMap(): Map<string, boolean> {
  const query = useQuery({
    queryKey: ["schedule-recurring-map"],
    queryFn: async () => {
      const schedules = await getSchedules();
      return new Map(schedules.map((s) => [s.id, isRecurring(s._date)] as const));
    },
  });

  useEffect(() => {
    return listen((event) => {
      if (event.tables.some((t) => SYNC_TABLES.has(t))) {
        query.refetch();
      }
    });
  }, [query]);

  return useMemo(() => query.data ?? new Map<string, boolean>(), [query.data]);
}
