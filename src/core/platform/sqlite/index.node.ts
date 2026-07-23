// Node/test implementation of the sqlite capability, backed by a real
// better-sqlite3 in-memory database so tests exercise real SQL semantics.
// Absorbed from the old expo-sqlite vitest stub, now conforming to our
// PlatformDatabase contract instead of impersonating expo's API.
//
// Databases are keyed by "<directory>::<name>" so tests that need multiple
// independent "clients" (e.g. sync convergence tests) can open distinct
// databases by passing distinct directory arguments, while reopening the
// same directory within a test reuses the same in-memory data — matching
// the on-disk persistence semantics of the native driver.
//
// Selected by the vitest resolve.alias for `@/core/platform/sqlite`.
import BetterSqlite3, { type Database as NativeDb } from "better-sqlite3";

import type { PlatformDatabase, PlatformSqlite, SqliteBindParams } from "./types";

export type { PlatformDatabase, SqliteBindParams } from "./types";

const registry = new Map<string, NativeDb>();

function keyFor(name: string, directory?: string): string {
  return `${directory ?? ""}::${name}`;
}

function wrap(db: NativeDb): PlatformDatabase {
  return {
    exec: async (sql) => {
      db.exec(sql);
    },
    execSync: (sql) => {
      db.exec(sql);
    },
    run: async (sql, params: SqliteBindParams = []) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
    },
    runSync: (sql, params: SqliteBindParams = []) => {
      const info = db.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
    },
    all: async <T>(sql: string, params: SqliteBindParams = []) =>
      db.prepare(sql).all(...params) as T[],
    allSync: <T>(sql: string, params: SqliteBindParams = []) =>
      db.prepare(sql).all(...params) as T[],
    first: async <T>(sql: string, params: SqliteBindParams = []) =>
      (db.prepare(sql).get(...params) as T) ?? null,
    firstSync: <T>(sql: string, params: SqliteBindParams = []) =>
      (db.prepare(sql).get(...params) as T) ?? null,
    transaction: async (task) => {
      // better-sqlite3 transactions must be synchronous, but our callers
      // await async work inside. Emulate with manual BEGIN/COMMIT/ROLLBACK
      // so the awaited body still runs against this DB.
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    serialize: async () => new Uint8Array(db.serialize()),
    close: async () => {
      // Keep the underlying better-sqlite3 handle registered so a later
      // re-open of the same directory sees the same data, matching on-disk
      // persistence semantics of the real driver. No-op here.
    },
  };
}

export const sqlite: PlatformSqlite = {
  openDatabase: async (name, _opts, directory) => {
    const key = keyFor(name, directory);
    let native = registry.get(key);
    if (!native) {
      native = new BetterSqlite3(":memory:");
      registry.set(key, native);
    }
    return wrap(native);
  },
};

export const { openDatabase } = sqlite;

/** Test-only: fully reset all in-memory databases between test files. */
export function __resetAllDatabases(): void {
  for (const db of registry.values()) db.close();
  registry.clear();
}
