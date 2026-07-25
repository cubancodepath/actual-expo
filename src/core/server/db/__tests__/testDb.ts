// Test-only helper: bootstraps a real (better-sqlite3-backed, in-memory)
// database + CRDT clock so sync/spreadsheet tests run against actual SQL
// instead of the no-op expo-sqlite stub.
import { openDatabase, closeDatabase } from "@/core/server/db";
import { loadClock } from "@/core/server/sync/clock";
import { unloadRules } from "@/core/server/transactions/transaction-rules";

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
  // Fresh DB → drop any rules store from a prior test (module state outlives
  // the per-test DB otherwise).
  unloadRules();
  return dir;
}

export async function closeTestDb(): Promise<void> {
  unloadRules();
  await closeDatabase();
}
