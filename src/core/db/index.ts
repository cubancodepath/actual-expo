import { sqlite, type PlatformDatabase, type SqliteBindParams } from "@/core/platform/sqlite";
import { runSchema } from "./schema";

// The connection lives on globalThis, not a module-level `let`, so it survives
// Fast Refresh. When Metro re-evaluates this module (or a dependency) the old
// module state is discarded — a plain `let _db` would reset to undefined and
// orphan the still-open native connection. Hermes then GCs that orphan and
// finalizes its lingering prepared statements while in-flight liveQueries are
// still running on it → use-after-free crash on expo.module.sqlite.AsyncQueue.
const _dbState = globalThis as typeof globalThis & {
  __actualDb?: PlatformDatabase;
  __actualDbDir?: string;
};

export async function openDatabase(budgetDir: string): Promise<void> {
  // Idempotent: the same budget already open (e.g. bootstrap re-running after a
  // Fast Refresh remount) reuses the live connection. Reopening with
  // useNewConnection:true would spawn a second connection and orphan the first.
  if (_dbState.__actualDb && _dbState.__actualDbDir === budgetDir) {
    if (__DEV__) console.log("[db] openDatabase (reuse)", budgetDir);
    return;
  }
  // Switching budgets, or a stale handle from a previous reload: close the old
  // connection and AWAIT it, so no statement finalize races the close.
  if (_dbState.__actualDb) {
    const stale = _dbState.__actualDb;
    _dbState.__actualDb = undefined;
    _dbState.__actualDbDir = undefined;
    try {
      await stale.close();
    } catch {
      // Already closed/invalid — nothing to do.
    }
  }

  if (__DEV__) console.log("[db] openDatabase", budgetDir);
  const db = await sqlite.openDatabase("db.sqlite", { useNewConnection: true }, budgetDir);
  await db.exec("PRAGMA journal_mode = WAL");
  await db.exec("PRAGMA foreign_keys = ON");
  // Secondary connections (upload snapshot, temp dbs) can briefly hold the
  // WAL writer lock — wait instead of failing with SQLITE_BUSY.
  await db.exec("PRAGMA busy_timeout = 5000");
  await runSchema(db);
  _dbState.__actualDb = db;
  _dbState.__actualDbDir = budgetDir;
}

export async function closeDatabase(): Promise<void> {
  // Drop the in-memory mappings cache tied to this budget. Dynamic import keeps
  // db/index.ts free of a static dependency on mappings.ts (which imports this
  // module) — no import cycle.
  const { clearMappings } = await import("./mappings");
  clearMappings();
  if (_dbState.__actualDb) {
    if (__DEV__) console.log("[db] closeDatabase");
    const dbToClose = _dbState.__actualDb;
    // Null first so getDb() throws a JS error, not a native "closed resource".
    _dbState.__actualDb = undefined;
    _dbState.__actualDbDir = undefined;
    await dbToClose.close();
  }
}

export function getDb(): PlatformDatabase {
  if (!_dbState.__actualDb) {
    if (__DEV__) console.trace("[db] getDb() called but _db is undefined");
    throw new Error("Database not initialized — call openDatabase() first");
  }
  return _dbState.__actualDb;
}

/** True when a connection is open. Use to make open flows idempotent (Fast Refresh). */
export function isDatabaseOpen(budgetDir?: string): boolean {
  if (!_dbState.__actualDb) return false;
  return budgetDir === undefined || _dbState.__actualDbDir === budgetDir;
}

export async function runQuery<T = unknown>(
  sql: string,
  params: SqliteBindParams = [],
): Promise<T[]> {
  const db = _dbState.__actualDb;
  if (!db) return [];
  return db.all<T>(sql, params);
}

/** Alias of {@link runQuery} — matches upstream `db.all`, so the ported AQL
 *  exec/executors read verbatim. */
export const all = runQuery;

export async function first<T = unknown>(
  sql: string,
  params: SqliteBindParams = [],
): Promise<T | null> {
  const db = _dbState.__actualDb;
  if (!db) return null;
  return db.first<T>(sql, params);
}

export async function run(sql: string, params: SqliteBindParams = []): Promise<void> {
  const db = _dbState.__actualDb;
  if (!db) return;
  await db.run(sql, params);
}

// ── Synchronous queries (for spreadsheet dynamic cells) ──

export function runQuerySync<T = unknown>(sql: string, params: SqliteBindParams = []): T[] {
  const db = _dbState.__actualDb;
  if (!db) return [];
  return db.allSync<T>(sql, params);
}

export function firstSync<T = unknown>(sql: string, params: SqliteBindParams = []): T | null {
  const db = _dbState.__actualDb;
  if (!db) return null;
  return db.firstSync<T>(sql, params);
}

export async function transaction(fn: () => Promise<void>): Promise<void> {
  // DEFERRED (not EXCLUSIVE) — serializeDbWrite() prevents concurrent writers,
  // so we don't need to block all readers during sync.
  await getDb().transaction(fn);
}

/**
 * FIFO gate for every flow that opens a transaction.
 *
 * SQLite has no nested transactions: two overlapping `transaction()` calls
 * fail with "cannot start a transaction within a transaction", and the loser's
 * rollback then fails too. Since these flows are async, "overlapping" needs no
 * concurrency — one awaiting mid-transaction while a timer fires is enough.
 * Anything that opens a transaction must queue here instead of assuming it is
 * the only writer.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

export function serializeDbWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  // Swallow the outcome for the queue's purposes — one rejected write must not
  // wedge every write behind it. The caller still sees the rejection.
  writeQueue = result.then(
    () => {},
    () => {},
  );
  return result;
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
  await db.exec(tables.map((t) => `DELETE FROM ${t};`).join("\n"));
}
