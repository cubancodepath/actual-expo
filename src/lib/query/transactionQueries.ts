/**
 * React Query options for transaction queries — a single AQL query path
 * (compiled to SQL with views/mappings).
 */

import { infiniteQueryOptions, keepPreviousData } from "@tanstack/react-query";
import { executeQuery } from "@/core/queries/execute";
import type { Query } from "@/core/shared/query";
import type { TransactionDisplay } from "@/core/types/models";

export const transactionQueries = {
  all: () => ["transactions"] as const,

  /**
   * AQL-based infinite query. `query` may be undefined while a screen is idle
   * (the caller disables the query via `enabled: false`); the key stays stable
   * and the fetch never runs in that case.
   */
  aql: ({
    query,
    pageSize = 25,
    activeBudgetId,
  }: {
    query?: Query;
    pageSize?: number;
    activeBudgetId?: string | null;
  }) =>
    infiniteQueryOptions<TransactionDisplay[]>({
      queryKey: [
        ...transactionQueries.all(),
        "aql",
        query ? query.serializeAsString() : "idle",
        pageSize,
        activeBudgetId,
      ],
      queryFn: async ({ pageParam }) => {
        if (!query) return [];
        const paged = query.offset((pageParam as number) * pageSize).limit(pageSize);
        const { data } = await executeQuery<TransactionDisplay>(paged);
        return data;
      },
      placeholderData: keepPreviousData,
      initialPageParam: 0,
      getNextPageParam: (lastPage, pages) =>
        lastPage.length < pageSize ? undefined : pages.length,
    }),
};
