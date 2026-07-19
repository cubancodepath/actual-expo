/**
 * useTransactions — React Query infinite query for transactions with sync-event
 * auto-refresh. Backed by a single AQL query path (compiled SQL with views/mappings).
 *
 * `query` may be undefined while a screen is idle (e.g. an unsubmitted search);
 * pass `options.enabled: false` alongside it so nothing runs until it's ready.
 *
 * @example useTransactions({ query: q("transactions").select("*") })
 */

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listen } from "@/core/sync/syncEvents";
import { transactionQueries } from "@/lib/query/transactionQueries";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import type { Query } from "@/core/queries/query";

const SYNC_TABLES = new Set(["transactions", "category_mapping", "payee_mapping"]);

export interface UseTransactionsProps {
  /** AQL query — uses compiled SQL with views/mappings. Undefined keeps it idle. */
  query?: Query;
  options?: {
    pageSize?: number;
    refetchOnSync?: boolean;
    /** When false the query stays idle (no fetch, no sync refetch). Default true. */
    enabled?: boolean;
  };
}

export function useTransactions({ query, options }: UseTransactionsProps) {
  const pageSize = options?.pageSize ?? 25;
  const refetchOnSync = options?.refetchOnSync ?? true;
  const enabled = (options?.enabled ?? true) && query != null;
  const activeBudgetId = useBudgetContextStore((s) => s.activeBudgetId);

  const queryOptions = useMemo(
    () => transactionQueries.aql({ query, pageSize, activeBudgetId }),
    [query, pageSize, activeBudgetId],
  );

  const queryResult = useInfiniteQuery({ ...queryOptions, enabled });

  // Auto-refetch on sync events (debounced to collapse bursts into one refetch)
  useEffect(() => {
    if (!refetchOnSync || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unlisten = listen((event) => {
      if (event.tables.some((t) => SYNC_TABLES.has(t))) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          queryResult.refetch();
        }, 100);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlisten();
    };
  }, [refetchOnSync, enabled]);

  const transactions = useMemo(() => queryResult.data?.pages.flat() ?? [], [queryResult.data]);

  return { ...queryResult, transactions };
}
