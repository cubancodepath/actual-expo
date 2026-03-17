/**
 * Core CRDT message application — writes messages to SQLite and updates
 * the in-memory Merkle trie. No network, no scheduling, no store refresh.
 */

import { getClock, merkle, Timestamp } from "../crdt";
import { run, runQuery, first, transaction } from "../db";
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
]);

export async function applyMessages(messages: SyncMessage[]): Promise<OldData> {
  if (messages.length === 0) return {};

  // Sort by timestamp for deterministic application
  const sorted = [...messages].sort((a, b) =>
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
    // SQLite has a limit of ~999 variables — chunk if needed
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
        const clock = getClock();
        const newMerkle = merkle.insert(clock.merkle, msg.timestamp);
        getClock().merkle = merkle.prune(newMerkle);
        continue;
      }

      if (!ALLOWED_TABLES.has(dataset)) {
        if (__DEV__)
          console.warn(
            `[applyMessages] REJECTED unknown dataset "${dataset}" row=${row} column=${column}`,
          );
        continue;
      }

      // Check if row already existed (use oldData to avoid extra query)
      const existed = oldData[dataset]?.[row] != null;

      if (existed) {
        await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
      } else {
        // Row may have been created by a prior message in this batch
        const existing = await first<{ id: string }>(`SELECT id FROM ${dataset} WHERE id = ?`, [
          row,
        ]);
        if (existing) {
          await run(`UPDATE ${dataset} SET ${column} = ? WHERE id = ?`, [value, row]);
        } else {
          await run(`INSERT INTO ${dataset} (id, ${column}) VALUES (?, ?)`, [row, value]);
        }
      }

      // Record in CRDT log
      await run(
        "INSERT OR IGNORE INTO messages_crdt (timestamp, dataset, row, column, value) VALUES (?, ?, ?, ?, ?)",
        [msg.timestamp.toString(), dataset, row, column, serialized],
      );

      // Update in-memory merkle trie
      const clock = getClock();
      const newMerkle = merkle.insert(clock.merkle, msg.timestamp);
      getClock().merkle = merkle.prune(newMerkle);
    }
  });

  await saveClock();

  // Apply synced metadata prefs (e.g. budgetName) to the prefs store
  if (Object.keys(prefsToSet).length > 0) {
    const { usePrefsStore } = await import("../stores/prefsStore");
    if (typeof prefsToSet.budgetName === "string") {
      usePrefsStore.getState().setPrefs({ budgetName: prefsToSet.budgetName });
    }
  }

  return oldData;
}

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
