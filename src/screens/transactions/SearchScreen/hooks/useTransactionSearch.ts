import { useCallback, useMemo } from "react";
import { searchTransactions } from "@/core/domain/transactions";
import { useTransactions } from "@/lib/hooks/useTransactions";
import type { SearchParams } from "../searchParams";

/**
 * Paged search results for a submitted set of params. `null` keeps the query
 * idle (nothing searched yet). Mutations from the row menu don't need manual
 * result surgery — they emit sync events and the underlying infinite query
 * refetches itself.
 */
export function useTransactionSearch(params: SearchParams | null) {
  // A stable key per submitted search; changing filters is a new query.
  const key = useMemo(() => `search:${JSON.stringify(params)}`, [params]);

  const fetchFn = useCallback(
    (limit: number, offset: number) => searchTransactions({ ...params, limit, offset }),
    [params],
  );

  return useTransactions({
    fetchFn,
    options: { key, enabled: params !== null },
  });
}
