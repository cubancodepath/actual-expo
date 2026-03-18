/**
 * useTransactions — React Query infinite query for transactions with sync-event auto-refresh.
 *
 * Ported from Actual Budget's desktop-client/src/hooks/useTransactions.ts.
 * Handles data fetching and pagination only. Mutations, selection, and undo
 * are handled by the consumer or separate hooks.
 *
 * @example
 * const { transactions, fetchNextPage, hasNextPage, isFetchingNextPage } = useTransactions({
 *   query: q("transactions").filter({ acct: accountId }).orderBy({ date: "desc" }),
 *   options: { pageSize: 25 },
 * });
 */

import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listen } from "@/sync/syncEvents";
import { transactionQueries } from "@/transactions/queries";
import type { Query } from "@/queries/query";

const SYNC_TABLES = new Set(["transactions", "category_mapping", "payee_mapping"]);

export interface UseTransactionsOptions {
  pageSize?: number;
  refetchOnSync?: boolean;
}

export interface UseTransactionsProps {
  query?: Query;
  options?: UseTransactionsOptions;
}

export function useTransactions({ query, options }: UseTransactionsProps) {
  const pageSize = options?.pageSize ?? 25;
  const refetchOnSync = options?.refetchOnSync ?? true;

  const queryResult = useInfiniteQuery(transactionQueries.aql({ query, pageSize }));

  // Auto-refetch on sync events (local mutations + remote sync)
  useEffect(() => {
    if (!refetchOnSync) return;
    return listen((event) => {
      if (event.tables.some((t) => SYNC_TABLES.has(t))) {
        queryResult.refetch();
      }
    });
  }, [refetchOnSync]);

  // Flatten pages into a single array
  const transactions = useMemo(
    () => queryResult.data?.pages.flat() ?? [],
    [queryResult.data],
  );

  return {
    ...queryResult,
    transactions,
  };
}
