/**
 * useTransactions — React Query infinite query for transactions with sync-event auto-refresh.
 *
 * Supports two modes:
 * - AQL query: `useTransactions({ query: q("transactions").select("*") })`
 * - Raw fetchFn: `useTransactions({ fetchFn: getAllTransactions })`
 */

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listen } from "@/sync/syncEvents";
import { transactionQueries } from "@/transactions/queries";
import { usePrefsStore } from "@/stores/prefsStore";
import type { Query } from "@/queries/query";
import type { TransactionDisplay } from "@/transactions/types";

const SYNC_TABLES = new Set(["transactions", "category_mapping", "payee_mapping"]);

export interface UseTransactionsProps {
  /** AQL query — uses compiled SQL with views/mappings. */
  query?: Query;
  /** Raw fetch function — for backwards compatibility. */
  fetchFn?: (limit: number, offset: number) => Promise<TransactionDisplay[]>;
  options?: {
    pageSize?: number;
    key?: string;
    refetchOnSync?: boolean;
  };
}

export function useTransactions({ query, fetchFn, options }: UseTransactionsProps) {
  const pageSize = options?.pageSize ?? 25;
  const key = options?.key ?? "all";
  const refetchOnSync = options?.refetchOnSync ?? true;
  const activeBudgetId = usePrefsStore((s) => s.activeBudgetId);

  const queryOptions = useMemo(() => {
    if (query) {
      return transactionQueries.aql({ query, pageSize, activeBudgetId });
    }
    if (fetchFn) {
      return transactionQueries.list({ fetchFn, pageSize, key, activeBudgetId });
    }
    throw new Error("useTransactions requires either query or fetchFn");
  }, [query, fetchFn, pageSize, key, activeBudgetId]);

  const queryResult = useInfiniteQuery(queryOptions);

  // Auto-refetch on sync events
  useEffect(() => {
    if (!refetchOnSync) return;
    return listen((event) => {
      if (event.tables.some((t) => SYNC_TABLES.has(t))) {
        queryResult.refetch();
      }
    });
  }, [refetchOnSync]);

  const transactions = useMemo(() => queryResult.data?.pages.flat() ?? [], [queryResult.data]);

  return { ...queryResult, transactions };
}
