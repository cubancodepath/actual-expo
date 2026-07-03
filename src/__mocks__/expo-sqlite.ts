// Vitest stub for expo-sqlite, backed by a real better-sqlite3 in-memory DB.
// Implements the subset of the SQLiteDatabase surface used by src/core/db/index.ts
// and src/core/db/schema.ts, so unit tests exercise real SQL semantics instead
// of a no-op stub.
import BetterSqlite3, { type Database as NativeDb } from "better-sqlite3";

// Keyed by "<directory>/<name>" so tests that need multiple independent
// "clients" (e.g. sync convergence tests) can open distinct databases by
// passing distinct directory arguments, while reopening the same directory
// within a test reuses the same in-memory data.
const registry = new Map<string, NativeDb>();

function keyFor(name: string, directory?: string): string {
  return `${directory ?? ""}::${name}`;
}

function bindParamsToArray(params: unknown): unknown[] {
  if (params == null) return [];
  if (Array.isArray(params)) return params;
  // Record<string, value> form — not used by this codebase's call sites,
  // but keep the shim honest with the real expo-sqlite union type.
  return Object.values(params as Record<string, unknown>);
}

class FakeSQLiteDatabase {
  constructor(private db: NativeDb) {}

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  execSync(source: string): void {
    this.db.exec(source);
  }

  async runAsync(
    source: string,
    params: unknown = [],
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    const info = this.db.prepare(source).run(...bindParamsToArray(params));
    return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
  }

  runSync(source: string, params: unknown = []): { changes: number; lastInsertRowId: number } {
    const info = this.db.prepare(source).run(...bindParamsToArray(params));
    return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
  }

  async getAllAsync<T = unknown>(source: string, params: unknown = []): Promise<T[]> {
    return this.db.prepare(source).all(...bindParamsToArray(params)) as T[];
  }

  getAllSync<T = unknown>(source: string, params: unknown = []): T[] {
    return this.db.prepare(source).all(...bindParamsToArray(params)) as T[];
  }

  async getFirstAsync<T = unknown>(source: string, params: unknown = []): Promise<T | null> {
    const row = this.db.prepare(source).get(...bindParamsToArray(params));
    return (row as T) ?? null;
  }

  getFirstSync<T = unknown>(source: string, params: unknown = []): T | null {
    const row = this.db.prepare(source).get(...bindParamsToArray(params));
    return (row as T) ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    // better-sqlite3 transactions must be synchronous, but our callers await
    // async work (SQLite driver calls) inside. Emulate with manual
    // BEGIN/COMMIT/ROLLBACK so the awaited body still runs against this DB.
    this.db.exec("BEGIN");
    try {
      await task();
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  async closeAsync(): Promise<void> {
    // Keep the underlying better-sqlite3 handle registered so a later
    // re-open of the same directory sees the same data, matching on-disk
    // persistence semantics of the real driver. No-op here.
  }
}

function openOrCreate(name: string, directory?: string): FakeSQLiteDatabase {
  const key = keyFor(name, directory);
  let native = registry.get(key);
  if (!native) {
    native = new BetterSqlite3(":memory:");
    registry.set(key, native);
  }
  return new FakeSQLiteDatabase(native);
}

export function openDatabaseSync(name: string, _options?: unknown, directory?: string) {
  return openOrCreate(name, directory);
}

export function openDatabaseAsync(name: string, _options?: unknown, directory?: string) {
  return Promise.resolve(openOrCreate(name, directory));
}

/** Test-only: fully reset all in-memory databases between test files. */
export function __resetAllDatabases(): void {
  for (const db of registry.values()) db.close();
  registry.clear();
}

export type SQLiteDatabase = FakeSQLiteDatabase;
export type SQLiteBindParams = unknown[];
