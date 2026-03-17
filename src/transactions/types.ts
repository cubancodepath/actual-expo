export type Transaction = {
  id: string;
  is_parent: boolean;
  is_child: boolean;
  account: string;
  date: number; // YYYYMMDD integer
  amount: number; // cents (negative = expense)
  category: string | null;
  payee: string | null;
  notes: string | null;
  parent_id: string | null;
  transfer_id: string | null;
  cleared: boolean;
  reconciled: boolean;
  sort_order: number | null;
  starting_balance_flag: boolean;
  schedule: string | null;
  tombstone: boolean;
  // Bank sync fields
  financialId: string | null; // unique ID from bank provider (for dedup)
  importedDescription: string | null; // raw payee name from bank
};

export type SplitTransactionError = {
  type: "SplitTransactionError";
  version: 1;
  difference: number;
};

export type TransactionWithSubtransactions = Transaction & {
  subtransactions: Transaction[];
  error: SplitTransactionError | null;
};

export type StatusFilter = "cleared" | "uncleared" | "reconciled" | "unreconciled";

export type SearchToken =
  | { type: "status"; value: StatusFilter }
  | { type: "account"; accountId: string; accountName: string }
  | { type: "category"; categoryId: string; categoryName: string }
  | { type: "payee"; payeeId: string; payeeName: string }
  | { type: "tag"; tagName: string }
  | { type: "uncategorized" };

export type GetTransactionsOptions = {
  accountId?: string;
  startDate?: number; // YYYYMMDD
  endDate?: number; // YYYYMMDD
  limit?: number;
  offset?: number;
};

export type TransactionDisplay = Transaction & {
  payeeName: string | null;
  categoryName: string | null;
  accountName?: string | null;
  splitCategoryNames?: string | null;
  splitCategoryAmounts?: string | null;
};
