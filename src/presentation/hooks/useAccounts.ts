/**
 * useAccounts — reactive accounts via liveQuery.
 *
 * Following Actual Budget's pattern: accounts are loaded without balances.
 * Balances are computed separately via useAccountBalance (one liveQuery
 * per account, reactive to transaction changes).
 */

import { useMemo } from "react";
import { q } from "@/queries";
import { useLiveQuery } from "./useQuery";
import type { Account } from "@/accounts/types";

/**
 * Reactive list of all accounts (without balances).
 */
export function useAccounts() {
  const { data, isLoading, hasLoaded } = useLiveQuery<Account>(() => q("accounts"), []);
  return { accounts: data ?? [], isLoading, hasLoaded };
}

/**
 * Reactive balance for a single account.
 * Computes SUM(amount) from transactions, auto-updates when transactions change.
 */
export function useAccountBalance(accountId: string | undefined): number {
  const { data } = useLiveQuery<{ result: number }>(
    () =>
      accountId
        ? q("transactions").filter({ acct: accountId }).calculate({ $sum: "$amount" })
        : null,
    [accountId],
  );
  return data?.[0]?.result ?? 0;
}

/**
 * Reactive total balance for a group of accounts.
 * Single liveQuery that sums transactions across all accounts in the group.
 */
export function useAccountGroupBalance(accountIds: string[]): number {
  const key = useMemo(() => accountIds.slice().sort().join(","), [accountIds]);
  const { data } = useLiveQuery<{ result: number }>(
    () =>
      accountIds.length > 0
        ? q("transactions")
            .filter({ acct: { $oneof: accountIds } })
            .calculate({ $sum: "$amount" })
        : null,
    [key],
  );
  return data?.[0]?.result ?? 0;
}
