// Native implementation of the sqlite capability, backed by expo-sqlite.
// The only module in src/core that imports the native sqlite dependency at
// runtime; the rest of core opens/queries the DB through the `sqlite` object
// and the PlatformDatabase contract — our vocabulary (exec/run/all/first),
// not the driver's. In vitest the whole module is swapped for
// `./index.node.ts` via resolve.alias.
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import type { PlatformDatabase, PlatformSqlite, SqliteBindParams } from "./types";

export type { PlatformDatabase, SqliteBindParams } from "./types";

function wrap(db: SQLiteDatabase): PlatformDatabase {
  return {
    exec: (sql) => db.execAsync(sql),
    execSync: (sql) => db.execSync(sql),
    run: async (sql, params: SqliteBindParams = []) => {
      const info = await db.runAsync(sql, params);
      return { changes: info.changes, lastInsertRowId: info.lastInsertRowId };
    },
    runSync: (sql, params: SqliteBindParams = []) => {
      const info = db.runSync(sql, params);
      return { changes: info.changes, lastInsertRowId: info.lastInsertRowId };
    },
    all: <T>(sql: string, params: SqliteBindParams = []) => db.getAllAsync<T>(sql, params),
    allSync: <T>(sql: string, params: SqliteBindParams = []) => db.getAllSync<T>(sql, params),
    first: <T>(sql: string, params: SqliteBindParams = []) => db.getFirstAsync<T>(sql, params),
    firstSync: <T>(sql: string, params: SqliteBindParams = []) => db.getFirstSync<T>(sql, params),
    transaction: (task) => db.withTransactionAsync(task),
    serialize: () => db.serializeAsync(),
    close: () => db.closeAsync(),
  };
}

export const sqlite: PlatformSqlite = {
  openDatabase: async (name, opts, directory) => {
    const db = await openDatabaseAsync(
      name,
      { useNewConnection: opts?.useNewConnection },
      directory,
    );
    return wrap(db);
  },
};

export const { openDatabase } = sqlite;
