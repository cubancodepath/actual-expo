import { useEffect, useState } from "react";
import { getAccounts } from "@/core/domain/accounts";
import type { Account } from "@/core/types/models";

/**
 * Accounts with their current balance (cents), loaded on demand for the account
 * picker sheet. Mirrors {@link useCategoryBalances}: reuses the domain
 * `getAccounts()` SQL (which computes balances via a transactions join), loads
 * asynchronously, and is safe against unmount races. Refetches whenever
 * `enabled` flips true (i.e. the sheet opens) so balances are fresh each open.
 */
export function useAccountsWithBalances(enabled: boolean): Account[] {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    getAccounts()
      .then((a) => alive && setAccounts(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled]);

  return accounts;
}
