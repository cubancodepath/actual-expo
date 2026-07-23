/**
 * Upcoming schedule previews for a transactions list, refreshed on sync.
 *
 * Wraps the core `getSchedulePreviews()` service (schedules → statuses →
 * previews with rules/splits applied) in a React Query keyed by the list
 * context. Only the "all" and "account" lists show previews for now.
 */

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listen } from "@/core/sync/syncEvents";
import { getSchedulePreviews } from "@/core/server/schedules";
import type { PreviewTransaction } from "@/core/server/schedules";
import type { TransactionsListContext } from "../TransactionsListScreen/types";

const SYNC_TABLES = new Set(["schedules", "schedules_next_date", "transactions", "rules"]);

export function useSchedulePreviews(context: TransactionsListContext): {
  previews: PreviewTransaction[];
} {
  const accountId = context.kind === "account" ? context.accountId : undefined;
  const enabled = context.kind === "all" || context.kind === "account";

  const query = useQuery({
    queryKey: ["schedule-previews", context.kind, accountId],
    queryFn: () => getSchedulePreviews(accountId ? (s) => s._account === accountId : undefined),
    enabled,
  });

  // Re-run when schedules, their next dates, transactions or rules change.
  useEffect(() => {
    if (!enabled) return;
    return listen((event) => {
      if (event.tables.some((t) => SYNC_TABLES.has(t))) {
        query.refetch();
      }
    });
  }, [enabled, query]);

  const previews = useMemo(() => query.data ?? [], [query.data]);
  return { previews };
}
