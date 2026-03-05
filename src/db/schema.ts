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
`;

const MIGRATIONS = [
  'ALTER TABLE zero_budgets ADD COLUMN carryover INTEGER DEFAULT 0',
  'ALTER TABLE zero_budgets ADD COLUMN goal INTEGER DEFAULT NULL',
  'ALTER TABLE zero_budgets ADD COLUMN long_goal INTEGER DEFAULT NULL',
  "ALTER TABLE categories ADD COLUMN template_settings TEXT DEFAULT '{\"source\": \"notes\"}'",
];

export async function runSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(TABLES);
  for (const sql of MIGRATIONS) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — ignore
    }
  }
}
