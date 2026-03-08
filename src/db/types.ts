/** Raw DB row types — match SQLite column names exactly */

export type AccountRow = {
  id: string;
  name: string;
  offbudget: 0 | 1;
  closed: 0 | 1;
  sort_order: number | null;
  last_reconciled: string | null;
  tombstone: 0 | 1;
};

export type TransactionRow = {
  id: string;
  isParent: 0 | 1;
  isChild: 0 | 1;
  acct: string;
  date: number; // YYYYMMDD
  amount: number; // cents
  category: string | null;
  description: string | null; // payee id
  notes: string | null;
  parent_id: string | null;
  transferred_id: string | null;
  cleared: 0 | 1;
  reconciled: 0 | 1;
  sort_order: number | null;
  starting_balance_flag: 0 | 1;
  tombstone: 0 | 1;
};

export type CategoryGroupRow = {
  id: string;
  name: string;
  is_income: 0 | 1;
  sort_order: number | null;
  hidden: 0 | 1;
  tombstone: 0 | 1;
};

export type CategoryRow = {
  id: string;
  name: string;
  is_income: 0 | 1;
  cat_group: string;
  sort_order: number | null;
  hidden: 0 | 1;
  goal_def: string | null;
  tombstone: 0 | 1;
};

export type PayeeRow = {
  id: string;
  name: string;
  transfer_acct: string | null;
  favorite: 0 | 1;
  tombstone: 0 | 1;
};

export type ZeroBudgetRow = {
  id: string;
  month: number; // YYYYMM
  category: string;
  amount: number;
  carryover: number;
  goal: number | null;
  long_goal: number | null;
};

export type NoteRow = {
  id: string;   // entity id (category, account, etc.)
  note: string | null;
};

export type PayeeMappingRow = {
  id: string;       // original payee id (or self-ref on creation)
  targetId: string; // canonical payee id (updated when payees are merged)
};

export type ZeroBudgetMonthRow = {
  id: string;      // YYYY-MM format (e.g. '2026-03')
  buffered: number; // cents held for next month
};

export type TagRow = {
  id: string;
  tag: string;
  color: string | null;
  description: string | null;
  tombstone: 0 | 1;
};

export type MessagesCrdtRow = {
  timestamp: string;
  dataset: string;
  row: string;
  column: string;
  value: string;
};

export type MessagesClockRow = {
  id: number;
  clock: string;
};
