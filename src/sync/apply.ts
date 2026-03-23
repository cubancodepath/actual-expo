/**
 * Core CRDT message application — writes messages to SQLite and updates
 * the in-memory Merkle trie. No network, no scheduling, no store refresh.
 *
 * Aligned with upstream Actual Budget (loot-core/src/server/sync/index.ts).
 */

import { getClock, merkle, Timestamp } from "../crdt";
import { run, runQuery, runQuerySync, first, transaction } from "../db";
import type { MessagesCrdtRow } from "../db/types";
import type { SyncMessage } from "./encoder";
import type { OldData } from "./undo";
import { serializeValue, deserializeValue } from "./values";
import { saveClock } from "./clock";

// Allowed tables — guard against arbitrary SQL injection via dataset name
const ALLOWED_TABLES = new Set([
  "accounts",
  "transactions",
  "categories",
  "category_groups",
  "category_mapping",
  "payees",
  "payee_mapping",
  "notes",
  "zero_budgets",
  "zero_budget_months",
  "preferences",
  "tags",
  "rules",
  "schedules",
  "schedules_next_date",
  "payee_locations",
  "dashboard",
  "dashboard_pages",
]);

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

  // Capture current DB state for each affected row BEFORE mutating (needed for undo)
  const oldData: OldData = {};
  const rowsToFetch = new Map<string, Set<string>>(); // dataset → Set<rowId>
  for (const msg of sorted) {
    if (msg.dataset === "prefs" || !ALLOWED_TABLES.has(msg.dataset)) continue;
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
        // Still record in CRDT log for merkle consistency
        await run(
          "INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)",
          [msg.timestamp.toString(), dataset, row, column, serialized],
        );
        getClock().merkle = merkle.insert(getClock().merkle, msg.timestamp);
        continue;
      }

      if (!ALLOWED_TABLES.has(dataset)) {
        if (__DEV__)
          console.warn(
            `[applyMessages] REJECTED unknown dataset "${dataset}" row=${row} column=${column}`,
          );
        continue;
      }

      // Old messages (already superseded in CRDT log) skip DB writes
      // but still get recorded in CRDT log and merkle trie below
      if (!msg.old) {
        const existed = oldData[dataset]?.[row] != null || added.has(dataset + row);

        if (existed) {
          await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
        } else {
          await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
        }

        added.add(dataset + row);
      }

      // Record in CRDT log (all messages, old or new)
      await run(
        "INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)",
        [msg.timestamp.toString(), dataset, row, column, serialized],
      );

      // Insert into merkle trie (no prune yet — upstream pattern)
      getClock().merkle = merkle.insert(getClock().merkle, msg.timestamp);
    }

    // Prune once at end of batch (upstream line 370), then save atomically
    getClock().merkle = merkle.prune(getClock().merkle);
    await saveClock();
  });

  // Apply synced metadata prefs (e.g. budgetName) to the prefs store
  if (Object.keys(prefsToSet).length > 0) {
    const { usePrefsStore } = await import("../stores/prefsStore");
    if (typeof prefsToSet.budgetName === "string") {
      usePrefsStore.getState().setPrefs({ budgetName: prefsToSet.budgetName });
    }
  }

  return oldData;
});

export async function getMessagesSince(since: string): Promise<SyncMessage[]> {
  const rows = await runQuery<MessagesCrdtRow>(
    "SELECT * FROM messages_crdt WHERE timestamp > ? ORDER BY timestamp",
    [since],
  );
  return rows.map((r) => ({
    timestamp: Timestamp.parse(r.timestamp)!,
    dataset: r.dataset,
    row: r.row,
    column: r.column,
    value: deserializeValue(r.value),
  }));
}
