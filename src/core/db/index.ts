import { openDatabaseAsync, type SQLiteDatabase, type SQLiteBindParams } from "expo-sqlite";
import { runSchema } from "./schema";

let _db: SQLiteDatabase | undefined;

export async function openDatabase(budgetDir: string): Promise<void> {
  if (__DEV__) console.log("[db] openDatabase", budgetDir);
  _db = await openDatabaseAsync("db.sqlite", { useNewConnection: true }, budgetDir);
  await _db.execAsync("PRAGMA journal_mode = WAL");
  await _db.execAsync("PRAGMA foreign_keys = ON");
  await runSchema(_db);
}

export async function closeDatabase(): Promise<void> {
  if (_db) {
    if (__DEV__) console.log("[db] closeDatabase");
    const dbToClose = _db;
    _db = undefined; // Null first so getDb() throws JS error, not native "closed resource"
    await dbToClose.closeAsync();
  }
}

export function getDb(): SQLiteDatabase {
  if (!_db) {
    if (__DEV__) console.trace("[db] getDb() called but _db is undefined");
    throw new Error("Database not initialized — call openDatabase() first");
  }
  return _db as SQLiteDatabase;
}

export async function runQuery<T = unknown>(
  sql: string,
  params: SQLiteBindParams = [],
): Promise<T[]> {
  if (!_db) return [];
  return _db.getAllAsync<T>(sql, params);
}

export async function first<T = unknown>(
  sql: string,
  params: SQLiteBindParams = [],
): Promise<T | null> {
  if (!_db) return null;
  return _db.getFirstAsync<T>(sql, params);
}

export async function run(sql: string, params: SQLiteBindParams = []): Promise<void> {
  if (!_db) return;
  await _db.runAsync(sql, params);
}

// ── Synchronous queries (for spreadsheet dynamic cells) ──

export function runQuerySync<T = unknown>(sql: string, params: SQLiteBindParams = []): T[] {
  if (!_db) return [];
  return _db.getAllSync<T>(sql, params);
}

export function firstSync<T = unknown>(sql: string, params: SQLiteBindParams = []): T | null {
  if (!_db) return null;
  return _db.getFirstSync<T>(sql, params);
}

export async function transaction(fn: () => Promise<void>): Promise<void> {
  await getDb().withExclusiveTransactionAsync(fn);
}

/** Wipe all local data by deleting rows from every table. Keeps the DB connection alive. */
export async function clearLocalData(): Promise<void> {
  const db = getDb();
  const tables = [
    "transactions",
    "accounts",
    "categories",
    "category_groups",
    "payees",
    "zero_budgets",
    "zero_budget_months",
    "payee_locations",
    "messages_crdt",
    "messages_clock",
    "payee_mapping",
    "category_mapping",
    "notes",
    "preferences",
    "tags",
    "schedules",
    "schedules_next_date",
    "schedules_json_paths",
    "rules",
  ];
  await db.execAsync(tables.map((t) => `DELETE FROM ${t};`).join("\n"));
}
