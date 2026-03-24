/**
 * usePayees — reactive payees via liveQuery.
 * Replaces usePayeesStore for data reads.
 */

import { q } from "@core/queries";
import { useLiveQuery } from "./useQuery";
import type { Payee } from "@core/payees/types";

export function usePayees() {
  const { data, isLoading } = useLiveQuery<Payee>(() => q("payees"), []);
  return { payees: data ?? [], isLoading };
}
