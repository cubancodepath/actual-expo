/**
 * useAccounts — reactive accounts via liveQuery (screens-first local hook).
 * Self-contained read used by the transaction screens.
 */

import { q } from "@/core/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Account } from "@/core/domain/accounts/types";

export function useAccounts() {
  const { data, isLoading, hasLoaded } = useLiveQuery<Account>(() => q("accounts"), []);
  return { accounts: data ?? [], isLoading, hasLoaded };
}
