import type { TransactionDisplay } from "@/core/domain/transactions/types";

/**
 * Where the list was opened from. `all` is the transactions tab (every
 * account); account context shows one account's ledger; category context
 * shows one category's activity within a budget month.
 */
export type TransactionsListContext =
  | { kind: "all" }
  | { kind: "account"; accountId: string }
  | {
      kind: "category";
      categoryId: string;
      /** Budget month "YYYY-MM". Defaults to the budget UI store's month. */
      month?: string;
    };

/**
 * Flattened LegendList model: date headers interleaved with transaction rows.
 * `isFirst`/`isLast` mark a row's position inside its date block so the block
 * can render as one visual card even though each row is virtualized alone.
 */
export type TxListItem =
  | { type: "header"; key: string; date: number }
  | {
      type: "transaction";
      key: string;
      txn: TransactionDisplay;
      isFirst: boolean;
      isLast: boolean;
    };

/**
 * Group date-descending transactions into header + row items. Assumes the
 * input is already ordered by date (the query's default order) — a new header
 * starts whenever the date changes, mirroring the original app's grouping.
 */
export function buildTxListItems(transactions: TransactionDisplay[]): TxListItem[] {
  const items: TxListItem[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const isNewDate = i === 0 || transactions[i - 1].date !== txn.date;
    if (isNewDate) {
      items.push({ type: "header", key: `date-${txn.date}`, date: txn.date });
    }
    const isLast = i === transactions.length - 1 || transactions[i + 1].date !== txn.date;
    items.push({
      type: "transaction",
      key: txn.id,
      txn,
      isFirst: isNewDate,
      isLast,
    });
  }
  return items;
}
