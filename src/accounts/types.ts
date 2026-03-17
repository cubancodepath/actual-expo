import type { BankSyncProvider } from "../bank-sync/types";

export type Account = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  sort_order: number | null;
  lastReconciled: string | null;
  tombstone: boolean;
  balance?: number; // cents, total (cleared + uncleared)
  clearedBalance?: number; // cents, sum of cleared transactions
  unclearedBalance?: number; // cents, sum of uncleared transactions
  // Bank sync fields
  accountSyncSource: BankSyncProvider | null;
  bankId: string | null; // references banks.bank_id (requisition ID for GoCardless)
  accountId: string | null; // remote account ID from the bank provider
  lastSync: string | null; // ISO timestamp of last successful sync
};
