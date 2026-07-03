/**
 * Core CRDT message application — writes messages to SQLite and updates
 * the in-memory Merkle trie. No network, no scheduling, no store refresh.
 *
 * Aligned with upstream Actual Budget (loot-core/src/server/sync/index.ts).
 */

import { getClock, merkle, Timestamp } from "@/core/crdt";
import type { TrieNode } from "@/core/crdt/merkle";
import { run, runQuery, runQuerySync, first, transaction } from "@/core/db";
import type { MessagesCrdtRow } from "@/core/db/types";
// Imported from its own module (not the "@/core/errors" barrel) to avoid
// pulling in toAppError.ts's i18n dependency chain, which isn't set up for
// plain-Node unit tests.
import { SyncError } from "@/core/errors/SyncError";
import type { SyncMessage, OutgoingSyncMessage } from "./encoder";
import type { OldData } from "./undo";
import { serializeValue, deserializeValue } from "./values";
import { saveClockWith } from "./clock";

// Tables that exist in the schema purely for local bookkeeping and are
// never legitimate CRDT sync targets — everything else in sqlite_master is
// a real, writable dataset. Deriving the allow-list from the schema (rather
// than a hand-maintained list) means it can never drift behind schema.ts:
// any dataset the desktop app can sync (custom_reports, reflect_budgets,
// transaction_filters, banks, ...) is automatically writable here too.
const EXCLUDED_TABLES = new Set([
  "messages_crdt",
  "messages_clock",
  "kvcache",
  "kvcache_key",
  "spreadsheet_cells",
  "db_version",
  "__migrations__",
  "__meta__",
  "created_budgets",
]);

/**
 * Real, writable dataset names — computed fresh from sqlite_master each
 * call (cheap catalog lookup, not worth caching+invalidating across budget
 * switches). This only guards which datasets get an actual SQL write; see
 * the main loop below — every message, including ones for datasets NOT in
 * this set, still gets folded into messages_crdt + the merkle trie so the
 * local merkle can always converge with peers that use features (or
 * schema versions) this client doesn't fully understand yet.
 */
function getWritableTables(): Set<string> {
  const rows = runQuerySync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  );
  return new Set(rows.map((r) => r.name).filter((name) => !EXCLUDED_TABLES.has(name)));
}

/**
 * Sequential execution guard — prevents concurrent applyMessages calls
 * from corrupting the merkle trie or DB. Upstream wraps applyMessages
 * with sequential() for the same reason.
 */
function sequential<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  let queue = Promise.resolve() as Promise<any>;
  return ((...args: any[]) => {
    const p = queue.then(() => fn(...args));
    queue = p.then(
      () => {},
      () => {},
    );
    return p;
  }) as T;
}

/**
 * Compare messages with existing CRDT log to deduplicate.
 * Ported from upstream Actual Budget's compareMessages().
 *
 * - No match in DB → message is new (apply normally)
 * - Match exists with different timestamp → message is old (skip DB write, still update merkle)
 * - Exact timestamp match → duplicate (skip entirely)
 */
// Synchronous — uses runQuerySync to match upstream's better-sqlite3 pattern.
// expo-sqlite supports sync queries, eliminating async marshaling overhead
// that made this function slow with 1000+ messages.
function compareMessages(messages: SyncMessage[]): SyncMessage[] {
  const result: SyncMessage[] = [];
  for (const msg of messages) {
    const rows = runQuerySync<{ timestamp: string }>(
      "SELECT timestamp FROM messages_crdt WHERE dataset = ? AND row = ? AND column = ? AND timestamp >= ?",
      [msg.dataset, msg.row, msg.column, msg.timestamp.toString()],
    );
    if (rows.length === 0) {
      result.push(msg);
    } else if (rows[0].timestamp !== msg.timestamp.toString()) {
      result.push({ ...msg, old: true });
    }
  }
  return result;
}

export const applyMessages = sequential(async function applyMessages(
  messages: SyncMessage[],
): Promise<OldData> {
  if (messages.length === 0) return {};

  // Deduplicate against existing CRDT log (upstream pattern)
  const deduped = compareMessages(messages);
  if (__DEV__) {
    const newCount = deduped.filter((m) => !m.old).length;
    const oldCount = deduped.filter((m) => m.old).length;
    const skipped = messages.length - deduped.length;
    console.log(
      `[applyMessages] ${messages.length} in → ${newCount} new, ${oldCount} old, ${skipped} skipped`,
    );
  }
  if (deduped.length === 0) return {};

  // Sort by timestamp for deterministic application
  const sorted = [...deduped].sort((a, b) =>
    a.timestamp.toString() < b.timestamp.toString() ? -1 : 1,
  );

  const prefsToSet: Record<string, string | number | null> = {};
  const writableTables = getWritableTables();

  // Capture current DB state for each affected row BEFORE mutating (needed for undo)
  const oldData: OldData = {};
  const rowsToFetch = new Map<string, Set<string>>(); // dataset → Set<rowId>
  for (const msg of sorted) {
    if (msg.dataset === "prefs" || !writableTables.has(msg.dataset)) continue;
    if (!rowsToFetch.has(msg.dataset)) rowsToFetch.set(msg.dataset, new Set());
    rowsToFetch.get(msg.dataset)!.add(msg.row);
  }

  for (const [dataset, rowIds] of rowsToFetch) {
    const ids = [...rowIds];
    // Batch fetch: SELECT ... WHERE id IN (?, ?, ...)
    const CHUNK_SIZE = 500;
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = await runQuery<Record<string, unknown>>(
        `SELECT * FROM ${dataset} WHERE id IN (${placeholders})`,
        chunk,
      );
      if (rows.length > 0) {
        if (!oldData[dataset]) oldData[dataset] = {};
        for (const row of rows) {
          oldData[dataset][row.id as string] = row;
        }
      }
    }
  }

  // Accumulated locally and only assigned to the real clock (getClock().merkle)
  // and persisted after the transaction commits — so a mid-apply throw can
  // never leave the in-memory clock ahead of what's on disk (upstream
  // sync/index.ts:320-391 follows the same pattern).
  let currentMerkle: TrieNode = getClock().merkle;

  await transaction(async () => {
    // Track rows created in this batch to avoid extra SELECT (upstream pattern)
    const added = new Set<string>();

    for (const msg of sorted) {
      const { dataset, row, column } = msg;
      const serialized = serializeValue(msg.value as string | number | null);
      const value = deserializeValue(serialized);

      // 'prefs' dataset = budget metadata (e.g. budgetName).
      // Not stored in DB — collected and applied to prefsStore after the loop.
      if (dataset === "prefs") {
        prefsToSet[row] = value;
        await run(
          "INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)",
          [msg.timestamp.toString(), dataset, row, column, serialized],
        );
        currentMerkle = merkle.insert(currentMerkle, msg.timestamp);
        continue;
      }

      // Unknown/unsupported dataset: we can't write it to a table (would be
      // arbitrary SQL), but it MUST still fold into messages_crdt + the
      // merkle below so this client's merkle can converge with peers that
      // use features or schema this client doesn't (yet) understand.
      // Matches upstream: every message is recorded regardless of dataset.
      if (!writableTables.has(dataset)) {
        if (__DEV__)
          console.warn(
            `[applyMessages] unknown dataset "${dataset}" row=${row} column=${column} — recording in CRDT log only, no table write`,
          );
      } else if (!msg.old) {
        // Old messages (already superseded in CRDT log) skip DB writes
        // but still get recorded in CRDT log and merkle trie below.
        const existed = oldData[dataset]?.[row] != null || added.has(dataset + row);

        try {
          if (existed) {
            await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
          } else {
            await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
          }
        } catch (err) {
          throw new SyncError("invalid-schema", { dataset, column, cause: err });
        }

        added.add(dataset + row);
      }

      // Record in CRDT log (all messages, old or new, known or unknown dataset)
      await run(
        "INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)",
        [msg.timestamp.toString(), dataset, row, column, serialized],
      );

      // Insert into merkle trie (no prune yet — upstream pattern)
      currentMerkle = merkle.insert(currentMerkle, msg.timestamp);
    }

    // Prune once at end of batch (upstream line 370), then persist — still
    // without touching the in-memory getClock().merkle.
    currentMerkle = merkle.prune(currentMerkle);
    await saveClockWith(currentMerkle);
  });

  // Transaction committed successfully — now, and only now, advance the
  // in-memory clock to match what was just persisted.
  getClock().merkle = currentMerkle;

  // Apply synced metadata prefs (e.g. budgetName) to the prefs store
  if (Object.keys(prefsToSet).length > 0) {
    const { usePrefsStore } = await import("@/stores/prefsStore");
    if (typeof prefsToSet.budgetName === "string") {
      usePrefsStore.getState().setPrefs({ budgetName: prefsToSet.budgetName });
    }
  }

  return oldData;
});

export async function getMessagesSince(since: string): Promise<OutgoingSyncMessage[]> {
  const rows = await runQuery<MessagesCrdtRow>(
    "SELECT * FROM messages_crdt WHERE timestamp > ? ORDER BY timestamp",
    [since],
  );
  return rows.map((r) => ({
    timestamp: Timestamp.parse(r.timestamp)!,
    dataset: r.dataset,
    row: r.row,
    column: r.column,
    // Raw wire-serialized string, verbatim from storage — no
    // deserialize→re-serialize round-trip (see OutgoingSyncMessage).
    value: r.value,
  }));
}
