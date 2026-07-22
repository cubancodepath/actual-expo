// Platform capability: SQLite. expo-sqlite's async API is the DB contract the
// mobile core builds on (unlike upstream loot-core, which abstracts to its own
// DB interface over better-sqlite3/absurd-sql). We isolate the dependency here
// so the whole engine imports the DB surface from one boundary
// (`@/core/platform/sqlite`) and never reaches for the native module directly.
export type { SQLiteDatabase, SQLiteBindParams } from "expo-sqlite";
