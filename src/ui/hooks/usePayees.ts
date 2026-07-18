/**
 * usePayees — reactive payees via liveQuery (screens-first local hook).
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Payee } from "@/core/domain/payees/types";

export function usePayees() {
  const { data, isLoading } = useLiveQuery<Payee>(() => q("payees"), []);
  return { payees: data ?? [], isLoading };
}
