import { useMemo } from "react";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { buildSearchQuery, type SearchParams } from "../searchParams";

/**
 * Paged search results for a submitted set of params. `null` keeps the query
 * idle (nothing searched yet). Mutations from the row menu don't need manual
 * result surgery — they emit sync events and the underlying infinite query
 * refetches itself.
 */
export function useTransactionSearch(params: SearchParams | null) {
  const query = useMemo(() => (params ? buildSearchQuery(params) : undefined), [params]);

  return useTransactions({
    query,
    options: { enabled: params !== null },
  });
}
