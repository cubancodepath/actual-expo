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
  transferred_id: string | null;
  cleared: boolean;
  reconciled: boolean;
  sort_order: number | null;
  starting_balance_flag: boolean;
  tombstone: boolean;
};

export type StatusFilter = 'cleared' | 'uncleared' | 'reconciled' | 'unreconciled';

export type SearchToken =
  | { type: 'status'; value: StatusFilter }
  | { type: 'account'; accountId: string; accountName: string }
  | { type: 'category'; categoryId: string; categoryName: string }
  | { type: 'tag'; tagName: string };

export type GetTransactionsOptions = {
  accountId?: string;
  startDate?: number; // YYYYMMDD
  endDate?: number;   // YYYYMMDD
  limit?: number;
  offset?: number;
};
