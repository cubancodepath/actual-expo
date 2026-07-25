/**
 * Message batching and sendMessages — the entry point for all local mutations.
 *
 * sendMessages() either buffers (during batchMessages) or applies immediately.
 * After applying, it records undo state, refreshes affected stores, and
 * schedules a debounced fullSync.
 *
 * Mutator queue (plan 009): this app runs mutations from several concurrent
 * async sources (60s sync poll, foreground fullSync, fire-and-forget
 * side-effects, user taps). The batching/undo flags above are module-global
 * mutable state, so without serialization a second flow's sendMessages()
 * could get silently swept into a first flow's in-flight batchMessages()
 * buffer. `runMutator` below is a FIFO gate (mirrors the `sequential()`
 * helper in apply.ts, reused as a local copy since apply.ts is out of scope
 * to touch) that every TOP-LEVEL mutation entry point must acquire before
 * touching `_isBatching`/`_batched` or undo.ts's listening flags. New
 * top-level mutation entry points MUST route through `runMutator` too —
 * reviewers should enforce this on any new domain mutator.
 */

import type { SyncMessage } from "./encoder";
import type { OldData } from "@/core/server/undo";
import { appendMessages as undoAppendMessages } from "@/core/server/undo";
import { applyMessages } from "./apply";
import { emit } from "./syncEvents";
import { isSwitchingBudget, clearSyncTimeout, setSyncTimeout, getSyncTimeout } from "./lifecycle";
import { checkSyncingMode } from "./syncMode";

const FULL_SYNC_DELAY = 1000; // ms

let _isBatching = false;
let _batched: SyncMessage[] = [];

export function resetBatchState(): void {
  _isBatching = false;
  _batched = [];
  _inMutator = false;
}

// ---------------------------------------------------------------------------
// Mutator queue — serializes all top-level mutation entry points
// ---------------------------------------------------------------------------

/**
 * FIFO queue primitive — same shape/semantics as apply.ts's `sequential()`
 * (duplicated locally: apply.ts is out of scope to modify). Each call gets
 * its own promise reflecting its own `fn`'s outcome; a rejection does NOT
 * poison the queue — the internal `queue` chain is re-anchored via
 * `.then(() => {}, () => {})`, which always resolves, so the next queued
 * call still runs after the failed one settles.
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

/** True only while a queued unit is actively executing (set/cleared exclusively by runMutator). */
let _inMutator = false;

/** Whether the caller is already running inside a queued top-level mutation. */
export function isInMutator(): boolean {
  return _inMutator;
}

const _runMutatorRaw = sequential(async (fn: () => Promise<unknown>): Promise<unknown> => {
  _inMutator = true;
  try {
    return await fn();
  } finally {
    _inMutator = false;
  }
});

/**
 * Runs `fn` as one atomic, FIFO-serialized unit relative to every other
 * top-level mutation entry point (sendMessages, batchMessages, undoable,
 * undo). Callers that are already nested inside a queued unit must NOT call
 * this again — check `isInMutator()` first, or re-entering here would
 * deadlock (the outer call can't settle until the inner one does, but the
 * inner one won't even start until the outer settles).
 */
export function runMutator<T>(fn: () => Promise<T>): Promise<T> {
  return _runMutatorRaw(fn) as Promise<T>;
}

function scheduleFullSync(): void {
  if (getSyncTimeout()) clearSyncTimeout();
  // Upstream sync/index.ts:555 — don't even schedule while offline/disabled
  // (offline: paused after a network failure until the next foreground
  // sync; disabled/import: local-only or bulk-loading, never syncs).
  if (!checkSyncingMode("enabled") || checkSyncingMode("offline")) return;
  setSyncTimeout(
    setTimeout(async () => {
      if (isSwitchingBudget()) return;
      // No store reads here (upstream parity): local-only budgets are gated by
      // the syncing MODE ("offline", set by loadBudget) checked above, and
      // missing cloud coordinates make fullSync a no-op. Errors are reported
      // by fullSync itself via sync events — the app-layer listenForSyncEvent
      // owns the reaction policy, so nothing is silently dropped here.
      const { fullSync } = await import("./fullSync"); // lazy: avoids module cycle
      await fullSync().catch(() => {
        // fullSync reports via events and doesn't rethrow; pure defense.
      });
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
  if (_inMutator) {
    // Nested call — already running inside a queued top-level mutation
    // (batchMessages body, an undoable mutator, or undo()). Keep today's
    // exact buffer-or-apply behavior; do NOT enqueue again (would deadlock:
    // the outer call can't settle until this one does).
    if (_isBatching) {
      _batched = _batched.concat(messages);
      return;
    }
    await _applyAndRecord(messages);
    return;
  }
  // Top-level call — acquire the queue and apply as one atomic unit,
  // serialized relative to every other top-level mutation.
  await runMutator(() => _applyAndRecord(messages));
}

export async function batchMessages(fn: () => Promise<void>): Promise<void> {
  if (_inMutator) {
    // Nested call — same rationale as above; run today's body inline.
    return batchMessagesBody(fn);
  }
  // Top-level call — the WHOLE body (guard set, fn, flush) runs as one
  // queued unit, so its flush can never interleave with another flow's.
  await runMutator(() => batchMessagesBody(fn));
}

async function batchMessagesBody(fn: () => Promise<void>): Promise<void> {
  // Re-entrancy guard: a nested batchMessages() call must append to the
  // OUTER buffer, not flush early and drop the outer call out of batching
  // mode (upstream sync/index.ts:501-505 has the same guard).
  if (_isBatching) {
    await fn();
    return;
  }
  _isBatching = true;
  try {
    await fn();
  } catch (err) {
    // A failed batch must apply nothing: discard the buffer (upstream
    // loot-core only sends after the body completes).
    _batched = [];
    throw err;
  } finally {
    _isBatching = false;
  }
  const batched = _batched;
  _batched = [];
  if (batched.length > 0) {
    await _applyAndRecord(batched);
  }
}

const BUDGET_TABLES = new Set([
  "zero_budgets",
  "reflect_budgets",
  "zero_budget_months",
  "transactions",
  "accounts",
  "category_mapping",
  "preferences", // watched for the budgetType row — see triggerBudgetChanges
]);

async function _applyAndRecord(messages: SyncMessage[]): Promise<void> {
  const oldData: OldData = await applyMessages(messages);
  undoAppendMessages(messages, oldData);
  // Granular budget cell invalidation (like loot-core's triggerBudgetChanges)
  const tables = [...new Set(messages.map((m) => m.dataset))];
  if (tables.some((t) => BUDGET_TABLES.has(t))) {
    const { triggerBudgetChanges } = await import("@/core/server/sheet");
    triggerBudgetChanges(messages);
  }
  // Notify all listeners (stores, live queries) about changed tables
  emit({ type: "applied", tables });
  scheduleFullSync(); // upload local changes to server after every mutation
}
