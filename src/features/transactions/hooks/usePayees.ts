/**
 * usePayees — reactive payees via liveQuery.
 * Replaces usePayeesStore for data reads.
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/shared/hooks/useQuery";
import type { Payee } from "@/core/domain/payees/types";

export function usePayees() {
  const { data, isLoading } = useLiveQuery<Payee>(() => q("payees"), []);
  return { payees: data ?? [], isLoading };
}
