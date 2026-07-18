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
