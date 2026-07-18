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
  /** Payee resolves to a transfer account — the row reads as a transfer. */
  isTransfer?: boolean;
  /** The transaction's own account is off budget. */
  accountOffbudget?: boolean;
  /** The transfer's destination account is off budget. */
  transferAccountOffbudget?: boolean;
  accountName?: string | null;
};
