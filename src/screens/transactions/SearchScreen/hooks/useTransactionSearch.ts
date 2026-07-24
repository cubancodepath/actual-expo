import { useMemo } from "react";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { useTransactionEnrichment } from "@/lib/hooks/useTransactionEnrichment";
import { buildSearchQuery, type SearchParams } from "../searchParams";

/**
 * Paged search results for a submitted set of params. `null` keeps the query
 * idle (nothing searched yet). Mutations from the row menu don't need manual
 * result surgery — they emit sync events and the underlying infinite query
 * refetches itself.
 */
export function useTransactionSearch(params: SearchParams | null) {
  const query = useMemo(() => (params ? buildSearchQuery(params) : undefined), [params]);

  const result = useTransactions({
    query,
    options: { enabled: params !== null },
  });
  const { enrich } = useTransactionEnrichment();
  const transactions = useMemo(() => enrich(result.transactions), [enrich, result.transactions]);
  return { ...result, transactions };
}
