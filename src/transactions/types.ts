export type Transaction = {
  id: string;
  isParent: boolean;
  isChild: boolean;
  acct: string;       // account id
  date: number;       // YYYYMMDD integer
  amount: number;     // cents (negative = expense)
  category: string | null;
  description: string | null; // payee id
  notes: string | null;
  parent_id: string | null;
  transferred_id: string | null;
  cleared: boolean;
  reconciled: boolean;
  sort_order: number | null;
  starting_balance_flag: boolean;
  tombstone: boolean;
};

export type SplitTransactionError = {
  type: 'SplitTransactionError';
  version: 1;
  difference: number;
};

export type TransactionWithSubtransactions = Transaction & {
  subtransactions: Transaction[];
  error: SplitTransactionError | null;
};

export type StatusFilter = 'cleared' | 'uncleared' | 'reconciled' | 'unreconciled';

export type SearchToken =
  | { type: 'status'; value: StatusFilter }
  | { type: 'account'; accountId: string; accountName: string }
  | { type: 'category'; categoryId: string; categoryName: string }
  | { type: 'payee'; payeeId: string; payeeName: string }
  | { type: 'tag'; tagName: string }
  | { type: 'uncategorized' };

export type GetTransactionsOptions = {
  accountId?: string;
  startDate?: number; // YYYYMMDD
  endDate?: number;   // YYYYMMDD
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
