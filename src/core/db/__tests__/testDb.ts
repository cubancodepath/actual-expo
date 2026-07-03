// Test-only helper: bootstraps a real (better-sqlite3-backed, in-memory)
// database + CRDT clock so sync/spreadsheet tests run against actual SQL
// instead of the no-op expo-sqlite stub.
import { openDatabase, closeDatabase } from "@/core/db";
import { loadClock } from "@/core/sync/clock";

let counter = 0;

/**
 * Opens a fresh, isolated in-memory database (schema + clock loaded) and
 * makes it the active db/index.ts singleton. Each call with no `directory`
 * gets its own unique in-memory database.
 */
export async function openTestDb(directory?: string): Promise<string> {
  const dir = directory ?? `test-${++counter}`;
  await openDatabase(dir);
  await loadClock();
  return dir;
}

export async function closeTestDb(): Promise<void> {
  await closeDatabase();
}
