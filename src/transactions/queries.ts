/**
 * React Query options for transaction queries.
 *
 * Ported from Actual Budget's desktop-client/src/transactions/queries.ts.
 * Uses our AQL compiler + expo-sqlite executor instead of IPC to server.
 */

import { infiniteQueryOptions, keepPreviousData } from "@tanstack/react-query";
import { executeQuery } from "@/queries/execute";
import type { Query } from "@/queries/query";

export const transactionQueries = {
  all: () => ["transactions"] as const,

  aql: ({ query, pageSize = 50 }: { query?: Query; pageSize?: number }) =>
    infiniteQueryOptions({
      queryKey: [...transactionQueries.all(), "aql", query?.serializeAsString(), pageSize],
      queryFn: async ({ pageParam }) => {
        if (!query) throw new Error("No query provided");
        const paged = query.offset((pageParam as number) * pageSize).limit(pageSize);
        const { data } = await executeQuery(paged);
        return data as Record<string, unknown>[];
      },
      placeholderData: keepPreviousData,
      initialPageParam: 0,
      getNextPageParam: (lastPage: unknown[], pages: unknown[][]) =>
        lastPage.length < pageSize ? undefined : pages.length,
      enabled: !!query,
    }),
};
