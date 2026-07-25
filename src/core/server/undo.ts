/**
 * Undo/redo system for actual-expo.
 *
 * Ported from loot-core/src/server/undo.ts. Divergences from upstream:
 * - No `undoTag` / UI-state tracking (mobile uses toasts, not URL/modal
 *   restoration). `meta` on markers is carried for structural parity but is
 *   not consumed yet — it's a placeholder for a future undoTag-style feature.
 * - No mutator context — uses simple boolean flags (`_undoListening` /
 *   `_undoDisabled`) plus batch.ts's `runMutator` FIFO for serialization.
 *
 * How it works:
 * 1. Domain functions wrapped with `undoable()` run through `withUndo()`,
 *    which places a marker and sets `_undoListening = true`
 * 2. `appendMessages(messages, oldData)` records each batch of CRDT messages
 *    along with a snapshot of the DB rows *before* the mutation
 * 3. `undo()` reverses the recorded messages using the oldData snapshot;
 *    `redo()` re-applies them (resurrecting tombstoned rows). Both generate
 *    new CRDT messages with fresh timestamps (just like any edit), so undo
 *    and redo sync to other devices.
 */

import { Timestamp } from "@/core/crdt";
import type { SyncMessage } from "@/core/server/sync/encoder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MarkerEntry = { type: "marker"; meta?: unknown };
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

/** Prevent undo-of-undo (and redo) from being recorded */
let _undoDisabled = false;

// Callback set by the undo store to receive state changes
let _onStateChange: ((state: { canUndo: boolean; canRedo: boolean }) => void) | null = null;

export function setOnStateChange(
  cb: (state: { canUndo: boolean; canRedo: boolean }) => void,
): void {
  _onStateChange = cb;
}

function notifyStateChange(): void {
  _onStateChange?.({ canUndo: canUndo(), canRedo: canRedo() });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function canUndo(): boolean {
  // Can undo if cursor is past the first marker and there are messages behind it
  return CURSOR > 0;
}

export function canRedo(): boolean {
  // Can redo if there is history ahead of the cursor
  return CURSOR < HISTORY.length - 1;
}

export function clearUndo(): void {
  HISTORY = [{ type: "marker" }];
  CURSOR = 0;
  notifyStateChange();
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

  notifyStateChange();
}

/**
 * Wraps a mutation function so its CRDT messages are recorded for undo.
 *
 * Plan 009: a TOP-LEVEL undoable call runs through batch.ts's `runMutator`
 * FIFO queue — the whole marker + flag + `fn` sequence executes as one queued
 * unit, serialized relative to every other top-level mutation. Two guards keep
 * it correct:
 *   - `_undoDisabled || _undoListening` short-circuits genuine nesting inside
 *     an outer undoable's own call tree (single undo group, no new marker).
 *   - `isInMutator()` covers the case where an undoable runs inside a bare
 *     mutator unit that is NOT undo-listening (e.g. an internal call made from
 *     within `batchMessages` — learning's `updateRule`). Re-entering
 *     `runMutator` there would deadlock the FIFO, so we open the undo group
 *     inline instead (same guard batch.ts's sendMessages/batchMessages use).
 */
export function undoable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  metaFunc?: (...args: Parameters<T>) => unknown,
): T {
  return (async (...args: any[]) => {
    if (_undoDisabled || _undoListening) {
      // Already inside an undo scope (nested call) — just execute
      return fn(...args);
    }

    const runInGroup = () => withUndo(() => fn(...args), metaFunc?.(...(args as Parameters<T>)));

    // Lazy import to avoid a circular dependency (batch.ts imports
    // appendMessages from this module).
    const { runMutator, isInMutator } = await import("@/core/server/sync/batch");
    // Already serialized by an outer mutator unit — don't re-enter the FIFO.
    if (isInMutator()) return runInGroup();
    return runMutator(runInGroup);
  }) as unknown as T;
}

/**
 * Opens an undoable group: places a marker (carrying optional `meta`), flips
 * `_undoListening` so every batch applied inside `func` is recorded, and
 * resets the flag afterwards. Mirrors upstream `withUndo`, minus the mutator
 * context. Unlike `undoable`, it does NOT acquire `runMutator` — callers that
 * are top-level entry points (i.e. `undoable`) do that.
 */
export async function withUndo<T>(func: () => Promise<T>, meta?: unknown): Promise<T> {
  if (_undoDisabled || _undoListening) {
    // Already inside an undo scope (nested call) — just execute
    return func();
  }

  // Trim any future history (invalidates any potential redo)
  HISTORY = HISTORY.slice(0, CURSOR + 1);

  const marker: MarkerEntry = { type: "marker", meta };

  const lastEntry = HISTORY[HISTORY.length - 1];
  if (lastEntry.type === "marker") {
    // Reuse the trailing empty marker (no messages recorded since the last
    // undoable call) — just attach this call's meta to it.
    HISTORY[HISTORY.length - 1] = marker;
  } else {
    HISTORY.push(marker);
    CURSOR++;
  }

  _undoListening = true;
  try {
    return await func();
  } finally {
    _undoListening = false;
  }
}

/**
 * Undo the last undoable operation. Generates reversed CRDT messages with
 * fresh timestamps and sends them through the normal sync pipeline.
 *
 * Plan 009: `undo()` is a top-level mutation entry point, so its whole body is
 * queued via `runMutator`, serialized relative to concurrent flows.
 */
export async function undo(): Promise<string[]> {
  const { runMutator } = await import("@/core/server/sync/batch");
  return runMutator(() => undoBody());
}

async function undoBody(): Promise<string[]> {
  if (!canUndo()) return [];

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
    notifyStateChange();
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

  const tables = await applyReplay(reversed);

  notifyStateChange();
  return tables;
}

/**
 * Redo the last undone operation. Re-applies the original messages (with fresh
 * timestamps) and resurrects any rows that undo had tombstoned.
 *
 * Like `undo()`, a top-level entry point routed through `runMutator`.
 */
export async function redo(): Promise<string[]> {
  const { runMutator } = await import("@/core/server/sync/batch");
  return runMutator(() => redoBody());
}

async function redoBody(): Promise<string[]> {
  if (!canRedo()) return [];

  const start = CURSOR;
  CURSOR = Math.min(CURSOR + 1, HISTORY.length - 1);

  // Walk forward to the nearest marker
  while (CURSOR < HISTORY.length - 1 && HISTORY[CURSOR].type !== "marker") {
    CURSOR++;
  }

  const end = CURSOR;
  const entries = HISTORY.slice(start + 1, end + 1).filter(
    (entry): entry is MessagesEntry => entry.type === "messages",
  );

  if (entries.length === 0) {
    notifyStateChange();
    return [];
  }

  const toApply: SyncMessage[] = entries.reduce<SyncMessage[]>((acc, entry) => {
    return acc.concat(entry.messages).concat(redoResurrections(entry.messages, entry.oldData));
  }, []);

  const tables = await applyReplay(toApply);

  notifyStateChange();
  return tables;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Send replay messages (undo reversals or redo re-applications) with fresh
 * timestamps, with undo-recording disabled so the replay itself is not
 * captured into the history. Returns the affected table names for the UI.
 */
async function applyReplay(messages: SyncMessage[]): Promise<string[]> {
  if (messages.length === 0) return [];

  const { sendMessages } = await import("@/core/server/sync");

  _undoDisabled = true;
  try {
    await sendMessages(messages.map((msg) => ({ ...msg, timestamp: Timestamp.send()! })));
  } finally {
    _undoDisabled = false;
  }

  // sendMessages already emits "applied" event which triggers liveQuery refresh
  return [...new Set(messages.map((m) => m.dataset))];
}

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

  // Budget rows: only certain columns are reversible (upstream includes
  // reflect_budgets — the tracking-budget table — too; server/undo.ts:187-190)
  if (
    message.dataset === "zero_budget_months" ||
    message.dataset === "zero_budgets" ||
    message.dataset === "reflect_budgets"
  ) {
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

/**
 * For a redo, compute the tombstone-clearing messages that "resurrect" any
 * rows which didn't exist before the original mutation (i.e. rows that undo
 * tombstoned). Mirrors upstream `redoResurrections` (server/undo.ts:239-271).
 */
function redoResurrections(messages: SyncMessage[], oldData: OldData): SyncMessage[] {
  const resurrect = new Set<string>();

  for (const message of messages) {
    const oldItem = oldData[message.dataset]?.[message.row];
    if (
      !oldItem &&
      ![
        "zero_budget_months",
        "zero_budgets",
        "reflect_budgets",
        "notes",
        "category_mapping",
        "payee_mapping",
      ].includes(message.dataset)
    ) {
      resurrect.add(message.dataset + "\0" + message.row);
    }
  }

  return [...resurrect].map((desc) => {
    const [dataset, row] = desc.split("\0");
    return {
      dataset,
      row,
      column: "tombstone",
      value: 0,
      timestamp: Timestamp.send()!,
    };
  });
}
