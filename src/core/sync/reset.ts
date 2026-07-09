import { getDb } from "@/core/db";
import { loadClock } from "./clock";

/**
 * Wipe the local CRDT sync state so the current database contents become a
 * fresh baseline (upstream loot-core/src/server/sync/reset.ts): deletes the
 * message log + clock and purges tombstoned rows, then loads a fresh clock
 * (missing row → new node id). Used before re-uploading the file as the new
 * server truth (sync reset, enabling encryption).
 */
export async function clearLocalSyncState(): Promise<void> {
  const db = getDb();
  await db.execAsync(`
    DELETE FROM messages_crdt;
    DELETE FROM messages_clock;
    DELETE FROM transactions WHERE tombstone = 1;
    DELETE FROM accounts WHERE tombstone = 1;
    DELETE FROM payees WHERE tombstone = 1;
    DELETE FROM categories WHERE tombstone = 1;
    DELETE FROM category_groups WHERE tombstone = 1;
    DELETE FROM schedules WHERE tombstone = 1;
    DELETE FROM rules WHERE tombstone = 1;
  `);
  await loadClock();
}
