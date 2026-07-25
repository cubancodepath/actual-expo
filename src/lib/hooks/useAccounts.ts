/**
 * useAccounts — reactive accounts via liveQuery.
 *
 * Following Actual Budget's pattern: accounts are loaded without balances.
 * Balances are computed separately via useAccountBalance (one liveQuery
 * per account, reactive to transaction changes).
 */

import { useMemo } from "react";
import { q } from "@/lib/queries";
import { useLiveQuery } from "@/hooks/useQuery";
import type { Account } from "@/core/types/models";

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
        ? q("transactions").filter({ account: accountId }).calculate({ $sum: "$amount" })
        : null,
    [accountId],
  );
  return data?.[0]?.result ?? 0;
}

/**
 * Reactive working / cleared / uncleared balances for a single account.
 * Two liveQueries (total + cleared); uncleared is derived so the parts always
 * sum to the working balance. Mirrors upstream's cleared/uncleared split.
 */
export function useAccountBalances(accountId: string | undefined): {
  balance: number;
  cleared: number;
  uncleared: number;
} {
  const { data: totalData } = useLiveQuery<{ result: number }>(
    () =>
      accountId
        ? q("transactions").filter({ account: accountId }).calculate({ $sum: "$amount" })
        : null,
    [accountId],
  );
  const { data: clearedData } = useLiveQuery<{ result: number }>(
    () =>
      accountId
        ? q("transactions")
            .filter({ account: accountId, cleared: true })
            .calculate({ $sum: "$amount" })
        : null,
    [accountId],
  );
  const balance = totalData?.[0]?.result ?? 0;
  const cleared = clearedData?.[0]?.result ?? 0;
  return { balance, cleared, uncleared: balance - cleared };
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
            .filter({ account: { $oneof: accountIds } })
            .calculate({ $sum: "$amount" })
        : null,
    [key],
  );
  return data?.[0]?.result ?? 0;
}
