export type Account = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  sort_order: number | null;
  tombstone: boolean;
  balance?: number;           // cents, total (cleared + uncleared)
  clearedBalance?: number;    // cents, sum of cleared transactions
  unclearedBalance?: number;  // cents, sum of uncleared transactions
};
