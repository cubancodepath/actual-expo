import type { SQLiteDatabase } from 'expo-sqlite';

// ---------------------------------------------------------------------------
// Tables — matches the original Actual Budget schema (init.sql + all migrations)
// so that uploaded databases are compatible with the original app.
// ---------------------------------------------------------------------------

const TABLES = `
CREATE TABLE IF NOT EXISTS created_budgets (month TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS spreadsheet_cells (
  name TEXT PRIMARY KEY,
  expr TEXT,
  cachedValue TEXT
);

CREATE TABLE IF NOT EXISTS banks (
  id TEXT PRIMARY KEY,
  bank_id TEXT,
  name TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  name TEXT,
  balance_current INTEGER,
  balance_available INTEGER,
  balance_limit INTEGER,
  mask TEXT,
  official_name TEXT,
  type TEXT,
  subtype TEXT,
  bank TEXT,
  offbudget INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0,
  account_sync_source TEXT,
  last_sync TEXT,
  last_reconciled TEXT
);

CREATE TABLE IF NOT EXISTS pending_transactions (
  id TEXT PRIMARY KEY,
  acct INTEGER,
  amount INTEGER,
  description TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  isParent INTEGER DEFAULT 0,
  isChild INTEGER DEFAULT 0,
  acct TEXT,
  category TEXT,
  amount INTEGER DEFAULT 0,
  description TEXT,
  notes TEXT,
  date INTEGER,
  financial_id TEXT,
  type TEXT,
  location TEXT,
  error TEXT,
  imported_description TEXT,
  starting_balance_flag INTEGER DEFAULT 0,
  transferred_id TEXT,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0,
  cleared INTEGER DEFAULT 1,
  pending INTEGER DEFAULT 0,
  parent_id TEXT,
  reconciled INTEGER DEFAULT 0,
  schedule TEXT,
  raw_synced_data TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_income INTEGER DEFAULT 0,
  cat_group TEXT,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0,
  goal_def TEXT,
  template_settings TEXT DEFAULT '{"source": "notes"}'
);

CREATE TABLE IF NOT EXISTS category_groups (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_income INTEGER DEFAULT 0,
  sort_order REAL,
  tombstone INTEGER DEFAULT 0,
  hidden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages_crdt (
  id INTEGER PRIMARY KEY,
  timestamp TEXT NOT NULL UNIQUE,
  dataset TEXT NOT NULL,
  row TEXT NOT NULL,
  column TEXT NOT NULL,
  value BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS category_mapping (
  id TEXT PRIMARY KEY,
  transferId TEXT
);

CREATE TABLE IF NOT EXISTS messages_clock (
  id INTEGER PRIMARY KEY,
  clock TEXT
);

CREATE TABLE IF NOT EXISTS db_version (version TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS __migrations__ (id INT PRIMARY KEY NOT NULL);
CREATE TABLE IF NOT EXISTS __meta__ (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS payees (
  id TEXT PRIMARY KEY,
  name TEXT,
  transfer_acct TEXT,
  favorite INTEGER DEFAULT 0,
  tombstone INTEGER DEFAULT 0,
  learn_categories BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payee_mapping (
  id TEXT PRIMARY KEY,
  targetId TEXT
);

CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  stage TEXT,
  conditions TEXT,
  actions TEXT,
  tombstone INTEGER DEFAULT 0,
  conditions_op TEXT DEFAULT 'and'
);

CREATE TABLE IF NOT EXISTS zero_budget_months (
  id TEXT PRIMARY KEY,
  buffered INTEGER DEFAULT 0
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

CREATE TABLE IF NOT EXISTS reflect_budgets (
  id TEXT PRIMARY KEY,
  month INTEGER,
  category TEXT,
  amount INTEGER DEFAULT 0,
  carryover INTEGER DEFAULT 0,
  goal INTEGER DEFAULT NULL,
  long_goal INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  note TEXT
);

CREATE TABLE IF NOT EXISTS kvcache (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS kvcache_key (id INTEGER PRIMARY KEY, key REAL);

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

CREATE TABLE IF NOT EXISTS transaction_filters (
  id TEXT PRIMARY KEY,
  name TEXT,
  conditions TEXT,
  conditions_op TEXT DEFAULT 'and',
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS custom_reports (
  id TEXT PRIMARY KEY,
  name TEXT,
  start_date TEXT,
  end_date TEXT,
  date_static INTEGER DEFAULT 0,
  date_range TEXT,
  mode TEXT DEFAULT 'total',
  group_by TEXT DEFAULT 'Category',
  balance_type TEXT DEFAULT 'Expense',
  show_empty INTEGER DEFAULT 0,
  show_offbudget INTEGER DEFAULT 0,
  show_hidden INTEGER DEFAULT 0,
  show_uncategorized INTEGER DEFAULT 0,
  selected_categories TEXT,
  graph_type TEXT DEFAULT 'BarGraph',
  conditions TEXT,
  conditions_op TEXT DEFAULT 'and',
  metadata TEXT,
  interval TEXT DEFAULT 'Monthly',
  color_scheme TEXT,
  tombstone INTEGER DEFAULT 0,
  include_current INTEGER DEFAULT 0,
  sort_by TEXT DEFAULT 'desc',
  trim_intervals INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS preferences (
  id TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS dashboard (
  id TEXT PRIMARY KEY,
  type TEXT,
  width INTEGER,
  height INTEGER,
  x INTEGER,
  y INTEGER,
  meta TEXT,
  tombstone INTEGER DEFAULT 0,
  dashboard_page_id TEXT
);

CREATE TABLE IF NOT EXISTS dashboard_pages (
  id TEXT PRIMARY KEY,
  name TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  tag TEXT UNIQUE,
  color TEXT,
  description TEXT,
  tombstone INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payee_locations (
  id TEXT PRIMARY KEY,
  payee_id TEXT,
  latitude REAL,
  longitude REAL,
  created_at INTEGER,
  tombstone INTEGER DEFAULT 0
);
`;

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

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

CREATE INDEX IF NOT EXISTS idx_payee_locations_payee_id ON payee_locations(payee_id);
CREATE INDEX IF NOT EXISTS idx_payee_locations_tombstone_payee_created ON payee_locations(tombstone, payee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payee_locations_geo_tombstone ON payee_locations(tombstone, latitude, longitude);
`;

// ---------------------------------------------------------------------------
// Migration IDs — migrations from the original Actual Budget.
// We insert these so the original app's checkDatabaseValidity() passes.
// Must match the Docker stable release (actualbudget/actual-server:latest).
// When a new stable release adds migrations, uncomment them here.
// ---------------------------------------------------------------------------

const MIGRATION_IDS = [
  1548957970627, 1550601598648, 1555786194328, 1561751833510, 1567699552727,
  1582384163573, 1597756566448, 1608652596043, 1608652596044, 1612625548236,
  1614782639336, 1615745967948, 1616167010796, 1618975177358, 1632571489012,
  1679728867040, 1681115033845, 1682974838138, 1685007876842, 1686139660866,
  1688749527273, 1688841238000, 1691233396000, 1694438752000, 1697046240000,
  1704572023730, 1704572023731, 1707267033000, 1712784523000, 1716359441000,
  1720310586000, 1720664867241, 1720665000000, 1722717601000, 1722804019000,
  1723665565000, 1730744182000, 1736640000000, 1737158400000, 1738491452000,
  1739139550000, 1740506588539, 1745425408000, 1749799110000, 1749799110001,
  1754611200000, 1759260219000, 1759842823172, 1762178745667, 1765518577215,
  // TODO: uncomment when Docker stable release includes these:
  // 1768872504000, // add_payee_locations
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runSchema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(TABLES);
  await db.execAsync(INDEXES);

  // Populate __migrations__ with all known IDs (idempotent via INSERT OR IGNORE)
  const values = MIGRATION_IDS.map(id => `(${id})`).join(',');
  await db.execAsync(`INSERT OR IGNORE INTO __migrations__ (id) VALUES ${values}`);
}
