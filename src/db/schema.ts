import type { SQLiteDatabase } from 'expo-sqlite';

const TABLES = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT,
  offbudget INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  isParent INTEGER DEFAULT 0,
  isChild INTEGER DEFAULT 0,
  acct TEXT,
  date INTEGER,
  amount INTEGER DEFAULT 0,
  category TEXT,
  description TEXT,
  notes TEXT,
  transferred_id TEXT,
  cleared INTEGER DEFAULT 0,
  reconciled INTEGER DEFAULT 0,
  sort_order REAL,
  starting_balance_flag INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS category_groups (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_income INTEGER DEFAULT 0,
  sort_order REAL,
  hidden INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_income INTEGER DEFAULT 0,
  cat_group TEXT,
  sort_order REAL,
  hidden INTEGER DEFAULT 0,
  goal_def TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  name TEXT,
  transfer_acct TEXT,
  favorite INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS zero_budgets (
  id TEXT PRIMARY KEY,
  month INTEGER,
  category TEXT,
  amount INTEGER DEFAULT 0,
  carryover INTEGER DEFAULT 0,
  goal INTEGER DEFAULT NULL,
  long_goal INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS messages_crdt (
  timestamp TEXT PRIMARY KEY,
  dataset TEXT,
  row TEXT,
  column TEXT,
  value TEXT
);

CREATE TABLE IF NOT EXISTS zero_budget_months (
  id TEXT PRIMARY KEY,
  buffered INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payee_mapping (
  id TEXT PRIMARY KEY,
  targetId TEXT
);

CREATE TABLE IF NOT EXISTS category_mapping (
  id TEXT PRIMARY KEY,
  transferId TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  note TEXT
);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  tag TEXT UNIQUE,
  color TEXT,
  description TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages_clock (
  id INTEGER PRIMARY KEY,
  clock TEXT
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  name TEXT,
  rule TEXT,
  active INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  posts_transaction INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedules_next_date (
  id TEXT PRIMARY KEY,
  schedule_id TEXT,
  local_next_date INTEGER,
  local_next_date_ts INTEGER,
  base_next_date INTEGER,
  base_next_date_ts INTEGER,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedules_json_paths (
  schedule_id TEXT PRIMARY KEY,
  payee TEXT,
  account TEXT,
  amount TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  stage TEXT,
  conditions TEXT,
  actions TEXT,
  tombstone INTEGER DEFAULT 0,
  conditions_op TEXT
);
`;

const MIGRATIONS = [
  'ALTER TABLE zero_budgets ADD COLUMN carryover INTEGER DEFAULT 0',
  'ALTER TABLE zero_budgets ADD COLUMN goal INTEGER DEFAULT NULL',
  'ALTER TABLE zero_budgets ADD COLUMN long_goal INTEGER DEFAULT NULL',
  "ALTER TABLE categories ADD COLUMN template_settings TEXT DEFAULT '{\"source\": \"notes\"}'",
  'ALTER TABLE transactions ADD COLUMN parent_id TEXT',
  'ALTER TABLE accounts ADD COLUMN last_reconciled TEXT',
  'ALTER TABLE transactions ADD COLUMN schedule TEXT',
];

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_transactions_acct ON transactions(acct);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_parent_id ON transactions(parent_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tombstone ON transactions(tombstone);

CREATE INDEX IF NOT EXISTS idx_categories_cat_group ON categories(cat_group);
CREATE INDEX IF NOT EXISTS idx_categories_tombstone ON categories(tombstone);

CREATE INDEX IF NOT EXISTS idx_category_groups_tombstone ON category_groups(tombstone);

CREATE INDEX IF NOT EXISTS idx_payees_transfer_acct ON payees(transfer_acct);
CREATE INDEX IF NOT EXISTS idx_payees_tombstone ON payees(tombstone);

CREATE INDEX IF NOT EXISTS idx_zero_budgets_month_category ON zero_budgets(month, category);

CREATE INDEX IF NOT EXISTS idx_payee_mapping_targetId ON payee_mapping(targetId);
CREATE INDEX IF NOT EXISTS idx_category_mapping_transferId ON category_mapping(transferId);

CREATE INDEX IF NOT EXISTS idx_messages_crdt_dataset_row ON messages_crdt(dataset, row);

CREATE INDEX IF NOT EXISTS idx_transactions_display
  ON transactions(acct, tombstone, isChild, date DESC, sort_order DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_children
  ON transactions(parent_id, tombstone);

CREATE INDEX IF NOT EXISTS idx_transactions_budget
  ON transactions(tombstone, isParent, date);

CREATE INDEX IF NOT EXISTS idx_transactions_cleared
  ON transactions(acct, cleared, isParent, tombstone);

CREATE INDEX IF NOT EXISTS idx_transactions_schedule ON transactions(schedule);

CREATE INDEX IF NOT EXISTS idx_schedules_tombstone ON schedules(tombstone);

CREATE INDEX IF NOT EXISTS idx_schedules_next_date_schedule_id ON schedules_next_date(schedule_id);
`;

export async function runSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(TABLES);
  for (const sql of MIGRATIONS) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — ignore
    }
  }
  await db.execAsync(INDEXES);
}
