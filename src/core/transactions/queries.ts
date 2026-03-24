/**
 * React Query options for transaction queries.
 *
 * Supports both AQL queries (compiled to SQL with views/mappings) and
 * raw fetchFn for backwards compatibility during migration.
 */

import { infiniteQueryOptions, keepPreviousData } from "@tanstack/react-query";
import { executeQuery } from "@core/queries/execute";
import type { Query } from "@core/queries/query";
import type { TransactionDisplay } from "./types";

type FetchFn = (limit: number, offset: number) => Promise<TransactionDisplay[]>;

export const transactionQueries = {
  all: () => ["transactions"] as const,

  /** AQL-based query — uses the compiler with views/mappings. */
  aql: ({
    query,
    pageSize = 25,
    activeBudgetId,
  }: {
    query: Query;
    pageSize?: number;
    activeBudgetId?: string | null;
  }) =>
    infiniteQueryOptions<TransactionDisplay[]>({
      queryKey: [
        ...transactionQueries.all(),
        "aql",
        query.serializeAsString(),
        pageSize,
        activeBudgetId,
      ],
      queryFn: async ({ pageParam }) => {
        const paged = query.offset((pageParam as number) * pageSize).limit(pageSize);
        const { data } = await executeQuery<TransactionDisplay>(paged);
        return data;
      },
      placeholderData: keepPreviousData,
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
        lastPage.length < pageSize ? undefined : pages.length,
    }),

  /** Raw fetchFn query — for screens not yet migrated to AQL. */
  list: ({
    fetchFn,
    pageSize = 25,
    key,
    activeBudgetId,
  }: {
    fetchFn: FetchFn;
    pageSize?: number;
    key?: string;
    activeBudgetId?: string | null;
  }) =>
    infiniteQueryOptions<TransactionDisplay[]>({
      queryKey: [...transactionQueries.all(), "list", key ?? "all", pageSize, activeBudgetId],
      queryFn: async ({ pageParam }) => {
        return fetchFn(pageSize, (pageParam as number) * pageSize);
      },
      placeholderData: keepPreviousData,
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
        lastPage.length < pageSize ? undefined : pages.length,
    }),
};
