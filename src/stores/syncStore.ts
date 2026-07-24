import { create } from "zustand";
import { fullSync, setSyncingMode } from "@/core/sync";
import { type ErrorCode } from "@/core/errors";

type SyncStatus = "idle" | "syncing" | "error" | "success";

type SyncState = {
  status: SyncStatus;
  /** Code of the error that last put status into "error". No UI renders it
   *  (deliberate local-first silence); the conflict-recovery flow reads it. */
  lastErrorCode: ErrorCode | null;
  /**
   * Set when the server rejected sync with a file-state conflict
   * (sync/file-has-reset etc.). While non-null, scheduled syncs bail and
   * SyncConflictDialog renders — it's the single source of truth for the
   * conflict UX. Cleared when the user resolves (or the budget changes).
   */
  conflictCode: ErrorCode | null;
  lastSync: Date | null;
  /**
   * THE app-level sync entry point: runs core's fullSync (which never rejects,
   * only emits sync events). The reaction policy — status transitions,
   * conflict recovery, session teardown — lives in src/lib/sync-events.ts and
   * the sync-recovery operations, NOT here.
   */
  sync(opts?: { force?: boolean }): Promise<void>;

  // Pure state transitions driven by the sync-event listener and the
  // sync-recovery operations (src/stores/operations/syncRecovery.ts).
  _setStatus(status: SyncStatus): void;
  _setErrorCode(code: ErrorCode): void;
  _setConflict(code: ErrorCode): void;
  clearConflict(): void;
  _resolveConflict(): void;
  /** Clear all sync state on a budget switch (the recovery guard is cleared
   *  separately by loadBudget via clearAutoRecoveryGuard). */
  resetForBudgetSwitch(): void;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  status: "idle",
  lastErrorCode: null,
  conflictCode: null,
  lastSync: null,

  async sync(opts) {
    const force = opts?.force ?? false;

    // An unresolved file-state conflict pauses all scheduled syncs — only the
    // SyncConflictDialog's recovery actions (which clear it) may sync again.
    if (!force && get().conflictCode) return;

    // fullSync never rejects: it emits sync events (start/success/error) and
    // the app-level listenForSyncEvent (src/lib/sync-events.ts) owns the
    // reaction policy. Upstream shape: the desktop sync button dispatches
    // sync() the same way and lets the event listener do the rest.
    await fullSync(opts);
  },

  _setStatus(status) {
    set({ status });
    if (status === "success") set({ lastSync: new Date() });
    if (status === "syncing") set({ lastErrorCode: null });
  },

  _setErrorCode(code) {
    set({ status: "error", lastErrorCode: code });
  },

  _setConflict(code) {
    set({ status: "error", lastErrorCode: code, conflictCode: code });
    // Pause scheduled syncs while the conflict is unresolved — the mode is
    // the pause CORE can see (scheduleFullSync checks it without importing
    // this store); conflictCode is the pause sync() and the dialog see.
    // "offline", not "disabled": applyMessages keeps recording local
    // mutations in the CRDT log, so nothing is lost whichever way the user
    // resolves. Non-conflict errors (key-mismatch etc.) deliberately do NOT
    // pause — the 60s poll retries and re-reports.
    setSyncingMode("offline");
  },

  clearConflict() {
    set({ conflictCode: null });
  },

  _resolveConflict() {
    get().clearConflict();
    set({ lastErrorCode: null });
    get()._setStatus("idle");
    setSyncingMode("enabled");
  },

  resetForBudgetSwitch() {
    // A conflict, error badge, or lastSync from budget A must never leak into
    // budget B: the dialog would pause B's syncs and its recovery actions
    // would operate on B with A's conflict. Called by loadBudget before
    // opening the new database.
    set({ status: "idle", lastErrorCode: null, conflictCode: null, lastSync: null });
  },
}));
