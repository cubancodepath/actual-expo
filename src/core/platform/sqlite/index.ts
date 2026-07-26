// Native implementation of the sqlite capability, backed by expo-sqlite.
// The only module in src/core that imports the native sqlite dependency at
// runtime; the rest of core opens/queries the DB through the `sqlite` object
// and the PlatformDatabase contract — our vocabulary (exec/run/all/first),
// not the driver's. In vitest the whole module is swapped for
// `./index.node.ts` via resolve.alias.
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { createQuiescer } from "./quiesce";
import type { PlatformDatabase, PlatformSqlite, SqliteBindParams } from "./types";

export type { PlatformDatabase, SqliteBindParams } from "./types";

function wrap(db: SQLiteDatabase): PlatformDatabase {
  // expo-sqlite runs async statements on a concurrent queue, so closing while
  // one is in flight is a use-after-free (see quiesce.ts). Every async call
  // below goes through `track` and close() waits for them; the sync calls run
  // on the JS thread, so the `assertOpen` flag is all they need.
  const q = createQuiescer();

  return {
    exec: (sql) => q.track(() => db.execAsync(sql)),
    execSync: (sql) => {
      q.assertOpen();
      db.execSync(sql);
    },
    run: (sql, params: SqliteBindParams = []) =>
      q.track(async () => {
        const info = await db.runAsync(sql, params);
        return { changes: info.changes, lastInsertRowId: info.lastInsertRowId };
      }),
    runSync: (sql, params: SqliteBindParams = []) => {
      q.assertOpen();
      const info = db.runSync(sql, params);
      return { changes: info.changes, lastInsertRowId: info.lastInsertRowId };
    },
    all: <T>(sql: string, params: SqliteBindParams = []) =>
      q.track(() => db.getAllAsync<T>(sql, params)),
    allSync: <T>(sql: string, params: SqliteBindParams = []) => {
      q.assertOpen();
      return db.getAllSync<T>(sql, params);
    },
    first: <T>(sql: string, params: SqliteBindParams = []) =>
      q.track(() => db.getFirstAsync<T>(sql, params)),
    firstSync: <T>(sql: string, params: SqliteBindParams = []) => {
      q.assertOpen();
      return db.getFirstSync<T>(sql, params);
    },
    transaction: (task) => q.track(() => db.withTransactionAsync(task)),
    serialize: () => q.track(() => db.serializeAsync()),
    close: () => q.close(() => db.closeAsync()),
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
