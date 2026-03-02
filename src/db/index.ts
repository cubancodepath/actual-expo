import { openDatabaseAsync, type SQLiteDatabase, type SQLiteBindParams } from 'expo-sqlite';
import { runSchema } from './schema';

let _db: SQLiteDatabase | undefined;

export async function openDatabase(): Promise<void> {
  _db = await openDatabaseAsync('actual.db');
  await _db.execAsync('PRAGMA journal_mode = WAL');
  await _db.execAsync('PRAGMA foreign_keys = ON');
  await runSchema(_db);
  // loadClock() is called by sync/index after openDatabase
}

export async function closeDatabase(): Promise<void> {
  if (_db) {
    await _db.closeAsync();
    _db = undefined;
  }
}

export function getDb(): SQLiteDatabase {
  if (!_db) throw new Error('Database not initialized — call openDatabase() first');
  return _db as SQLiteDatabase;
}

export async function runQuery<T = unknown>(
  sql: string,
  params: SQLiteBindParams = [],
): Promise<T[]> {
  return getDb().getAllAsync<T>(sql, params);
}

export async function first<T = unknown>(
  sql: string,
  params: SQLiteBindParams = [],
): Promise<T | null> {
  return getDb().getFirstAsync<T>(sql, params);
}

export async function run(
  sql: string,
  params: SQLiteBindParams = [],
): Promise<void> {
  await getDb().runAsync(sql, params);
}

export async function transaction(fn: () => Promise<void>): Promise<void> {
  await getDb().withExclusiveTransactionAsync(fn);
}

/** Wipe all local data when switching to a different budget file. */
export async function clearLocalData(): Promise<void> {
  const tables = [
    'accounts', 'transactions', 'categories', 'category_groups',
    'payees', 'zero_budgets', 'messages_crdt', 'messages_clock',
  ];
  for (const t of tables) {
    await run(`DELETE FROM ${t}`);
  }
}
