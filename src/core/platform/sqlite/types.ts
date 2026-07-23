// Platform capability contract: SQLite. The database surface the whole
// engine builds on, in our own vocabulary — exec/run/all/first (+ sync
// variants), transaction, close — so no driver naming (expo-sqlite,
// better-sqlite3…) leaks through the seam. Each target ships an object
// conforming to PlatformSqlite (index.ts = expo-sqlite adapter,
// index.node.ts = better-sqlite3-backed Node/test implementation).
export type SqliteBindValue = string | number | null | Uint8Array;
export type SqliteBindParams = SqliteBindValue[];

export type SqliteRunResult = { changes: number; lastInsertRowId: number };

export interface PlatformDatabase {
  /** Execute one or more statements without reading results. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqliteBindParams): Promise<SqliteRunResult>;
  all<T = unknown>(sql: string, params?: SqliteBindParams): Promise<T[]>;
  first<T = unknown>(sql: string, params?: SqliteBindParams): Promise<T | null>;
  execSync(sql: string): void;
  runSync(sql: string, params?: SqliteBindParams): SqliteRunResult;
  allSync<T = unknown>(sql: string, params?: SqliteBindParams): T[];
  firstSync<T = unknown>(sql: string, params?: SqliteBindParams): T | null;
  /** Run `task` inside BEGIN/COMMIT, rolling back if it throws. */
  transaction(task: () => Promise<void>): Promise<void>;
  /** Consistent byte snapshot of the database (sqlite3_serialize). */
  serialize(): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface PlatformSqlite {
  openDatabase(
    name: string,
    opts?: { useNewConnection?: boolean },
    directory?: string,
  ): Promise<PlatformDatabase>;
}
