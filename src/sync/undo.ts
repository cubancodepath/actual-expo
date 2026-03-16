/**
 * Undo system for actual-expo.
 *
 * Ported from loot-core/src/server/undo.ts, simplified for the mobile app:
 * - No redo (can be added later)
 * - No undoTag / UI-state tracking (mobile uses toasts, not URL restoration)
 * - No mutator context — uses a simple boolean flag
 *
 * How it works:
 * 1. Domain functions wrapped with `undoable()` set `_undoListening = true`
 * 2. `appendMessages(messages, oldData)` records each batch of CRDT messages
 *    along with a snapshot of the DB rows *before* the mutation
 * 3. `undo()` reverses the recorded messages using the oldData snapshot,
 *    generating new CRDT messages with fresh timestamps (just like any edit)
 * 4. Because undo generates normal CRDT messages, undo actions sync to other devices
 */

import { Timestamp } from "../crdt";
import type { SyncMessage } from "./encoder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MarkerEntry = { type: "marker" };
type MessagesEntry = {
  type: "messages";
  messages: SyncMessage[];
  oldData: OldData;
};
type HistoryEntry = MarkerEntry | MessagesEntry;

/** Snapshot of DB rows before a mutation: oldData[dataset][rowId] = { col: value, ... } */
export type OldData = Record<string, Record<string, Record<string, unknown>>>;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let HISTORY: HistoryEntry[] = [{ type: "marker" }];
let CURSOR = 0;
const HISTORY_SIZE = 20;

/** When true, messages are recorded into the undo history */
let _undoListening = false;

/** Prevent undo-of-undo from being recorded */
let _undoDisabled = false;

// Callback set by the undo store to receive state changes
let _onStateChange: ((canUndo: boolean) => void) | null = null;

export function setOnStateChange(cb: (canUndo: boolean) => void): void {
  _onStateChange = cb;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function canUndo(): boolean {
  // Can undo if cursor is past the first marker and there are messages behind it
  return CURSOR > 0;
}

export function clearUndo(): void {
  HISTORY = [{ type: "marker" }];
  CURSOR = 0;
  _onStateChange?.(false);
}

/**
 * Called by `applyMessages()` after capturing oldData and applying messages.
 * Only records if we're inside an `undoable()` call.
 */
export function appendMessages(messages: SyncMessage[], oldData: OldData): void {
  if (!_undoListening || _undoDisabled || messages.length === 0) return;

  trimHistory();

  HISTORY.push({ type: "messages", messages, oldData });
  CURSOR++;

  _onStateChange?.(canUndo());
}

/**
 * Wraps a mutation function so its CRDT messages are recorded for undo.
 * Places a marker at the start of the operation (one "undo step").
 */
export function undoable<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    if (_undoDisabled || _undoListening) {
      // Already inside an undo scope (nested call) — just execute
      return fn(...args);
    }

    // Trim any future history (invalidates any potential redo)
    HISTORY = HISTORY.slice(0, CURSOR + 1);

    // Place a marker at the current position
    const lastEntry = HISTORY[HISTORY.length - 1];
    if (lastEntry.type === "marker") {
      // Reuse empty marker (no messages were recorded since last undoable call)
      // This is fine — it just means the previous undoable was a no-op
    } else {
      HISTORY.push({ type: "marker" });
      CURSOR++;
    }

    _undoListening = true;
    try {
      return await fn(...args);
    } finally {
      _undoListening = false;
    }
  }) as unknown as T;
}

/**
 * Undo the last undoable operation. Generates reversed CRDT messages
 * with fresh timestamps and sends them through the normal sync pipeline.
 */
export async function undo(): Promise<string[]> {
  if (!canUndo()) return [];

  // Lazy import to avoid circular dependency
  const { sendMessages } = await import("./index");

  const end = CURSOR;
  CURSOR = Math.max(CURSOR - 1, 0);

  // Walk back to the nearest marker
  while (CURSOR > 0 && HISTORY[CURSOR].type !== "marker") {
    CURSOR--;
  }

  const start = Math.max(CURSOR, 0);
  const entries = HISTORY.slice(start, end + 1).filter(
    (entry): entry is MessagesEntry => entry.type === "messages",
  );

  if (entries.length === 0) {
    _onStateChange?.(canUndo());
    return [];
  }

  // Build reversed messages
  const reversed: SyncMessage[] = entries
    .reduce<SyncMessage[]>((acc, entry) => {
      const undone = entry.messages
        .map((msg) => undoMessage(msg, entry.oldData))
        .filter((m): m is SyncMessage => m !== null);
      return acc.concat(undone);
    }, [])
    .reverse();

  // Apply with fresh timestamps — disable undo recording to prevent circular undo
  _undoDisabled = true;
  try {
    await sendMessages(reversed.map((msg) => ({ ...msg, timestamp: Timestamp.send()! })));
  } finally {
    _undoDisabled = false;
  }

  // Refresh stores so the UI reflects the reverted state
  const { refreshAllStores } = await import("./index");
  await refreshAllStores();

  // Collect affected tables for the UI notification
  const tables = [...new Set(reversed.map((m) => m.dataset))];

  _onStateChange?.(canUndo());
  return tables;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function trimHistory(): void {
  HISTORY = HISTORY.slice(0, CURSOR + 1);

  const markers = HISTORY.filter((item) => item.type === "marker");
  if (markers.length > HISTORY_SIZE) {
    const slice = markers.slice(-HISTORY_SIZE);
    const cutoff = HISTORY.indexOf(slice[0]);
    HISTORY = HISTORY.slice(cutoff);
    CURSOR = HISTORY.length - 1;
  }
}

/**
 * Reverse a single CRDT message using the pre-mutation snapshot.
 * Returns null if the message should not be reversed.
 */
function undoMessage(message: SyncMessage, oldData: OldData): SyncMessage | null {
  const oldDataset = oldData[message.dataset];
  const oldItem = oldDataset?.[message.row];

  if (oldItem) {
    // Row existed before the mutation — restore the previous value
    return { ...message, value: oldItem[message.column] as string | number | null };
  }

  // Row didn't exist before — this was a creation. Handle special datasets:

  // Mapping tables are never deleted (harmless meta-info)
  if (message.dataset === "category_mapping" || message.dataset === "payee_mapping") {
    return null;
  }

  // Budget rows: only certain columns are reversible
  if (message.dataset === "zero_budget_months" || message.dataset === "zero_budgets") {
    if (["buffered", "amount", "carryover"].includes(message.column)) {
      return { ...message, value: 0 };
    }
    return null;
  }

  // Notes: revert to null
  if (message.dataset === "notes") {
    return { ...message, value: null };
  }

  // Everything else (accounts, transactions, categories, payees, etc.):
  // tombstone the newly created row
  return { ...message, column: "tombstone", value: 1 };
}
