/**
 * useRunningBalances — compute a running account balance map for a sorted
 * list of transactions.
 *
 * Mirrors the desktop's TransactionListWithBalances logic:
 * starting from the current account balance, subtract amounts going
 * chronologically backwards so that each transaction shows its
 * post-transaction balance.
 *
 * @param transactions  Sorted newest-first (matches LegendList render order).
 * @param accountBalance  Current live balance of the account.
 * @returns Map<transactionId, runningBalance>
 */

import { useMemo } from "react";

type MinTransaction = { id: string; amount: number; is_parent?: boolean; is_child?: boolean };

export function useRunningBalances(
  transactions: MinTransaction[],
  accountBalance: number,
): Map<string, number> {
  return useMemo(() => {
    const map = new Map<string, number>();
    // Transactions are newest-first. Walk forward through the list:
    // the first transaction's post-balance = accountBalance.
    // Each subsequent transaction's post-balance = previous - current amount.
    let running = accountBalance;
    for (const tx of transactions) {
      // Skip child split transactions — they don't independently move balance.
      if (tx.is_child) continue;
      map.set(tx.id, running);
      running -= tx.amount;
    }
    return map;
  }, [transactions, accountBalance]);
}
