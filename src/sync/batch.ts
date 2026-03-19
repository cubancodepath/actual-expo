/**
 * Message batching and sendMessages — the entry point for all local mutations.
 *
 * sendMessages() either buffers (during batchMessages) or applies immediately.
 * After applying, it records undo state, refreshes affected stores, and
 * schedules a debounced fullSync.
 */

import type { SyncMessage } from "./encoder";
import type { OldData } from "./undo";
import { appendMessages as undoAppendMessages } from "./undo";
import { applyMessages } from "./apply";
import { emit } from "./syncEvents";
import { isSwitchingBudget, clearSyncTimeout, setSyncTimeout, getSyncTimeout } from "./lifecycle";

const FULL_SYNC_DELAY = 1000; // ms

let _isBatching = false;
let _batched: SyncMessage[] = [];

export function resetBatchState(): void {
  _isBatching = false;
  _batched = [];
}

function scheduleFullSync(): void {
  if (getSyncTimeout()) clearSyncTimeout();
  setSyncTimeout(
    setTimeout(async () => {
      if (isSwitchingBudget()) return;
      try {
        const { usePrefsStore } = await import("../stores/prefsStore");
        const prefs = usePrefsStore.getState();
        if (prefs.isLocalOnly || !prefs.isConfigured) return;
        // Lazy import to avoid circular dependency
        const { fullSync } = await import("./fullSync");
        await fullSync();
      } catch {
        // fullSync already writes the error into syncStore — nothing to do here
      }
    }, FULL_SYNC_DELAY),
  );
}

export async function sendMessages(messages: SyncMessage[]): Promise<void> {
  if (__DEV__) {
    const scheduleTables = new Set(["rules", "schedules", "schedules_next_date"]);
    const relevant = messages.filter((m) => scheduleTables.has(m.dataset));
    if (relevant.length > 0) {
      console.log(
        "[sendMessages] schedule-related messages:",
        relevant.map((m) => ({
          dataset: m.dataset,
          row: m.row,
          column: m.column,
          value:
            typeof m.value === "string" && m.value.length > 80
              ? m.value.slice(0, 80) + "…"
              : m.value,
        })),
      );
    }
  }
  if (_isBatching) {
    _batched = _batched.concat(messages);
    return;
  }
  await _applyAndRecord(messages);
}

export async function batchMessages(fn: () => Promise<void>): Promise<void> {
  _isBatching = true;
  try {
    await fn();
  } finally {
    _isBatching = false;
    const batched = _batched;
    _batched = [];
    if (batched.length > 0) {
      await _applyAndRecord(batched);
    }
  }
}

const BUDGET_TABLES = new Set(["zero_budgets", "zero_budget_months", "transactions"]);

async function _applyAndRecord(messages: SyncMessage[]): Promise<void> {
  const oldData: OldData = await applyMessages(messages);
  undoAppendMessages(messages, oldData);
  // Granular budget cell invalidation (like loot-core's triggerBudgetChanges)
  const tables = [...new Set(messages.map((m) => m.dataset))];
  if (tables.some((t) => BUDGET_TABLES.has(t))) {
    const { triggerBudgetChanges } = await import("../spreadsheet/sync");
    triggerBudgetChanges(messages);
  }
  // Notify all listeners (stores, live queries) about changed tables
  emit({ type: "applied", tables });
  scheduleFullSync(); // upload local changes to server after every mutation
}
