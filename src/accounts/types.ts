export type Account = {
  id: string;
  name: string;
  offbudget: boolean;
  closed: boolean;
  sort_order: number | null;
  tombstone: boolean;
  balance?: number;  // cents, computed from transactions
};
