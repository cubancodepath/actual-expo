import { create } from "zustand";
import { fullSync, setSyncingMode } from "@/core/sync";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { readMetadata, deleteBudgetDir } from "@/core/server/prefs";
import { getRemoteFiles, uploadBudget, downloadBudget } from "@/core/server/cloud-storage";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

type SyncStatus = "idle" | "syncing" | "error" | "success";

// One-shot guard for the automatic recoveries: if e.g. resetSync's own upload
// gets rejected again, retrying in a loop would hammer the server — fall through
// to the conflict dialog instead. Cleared on any successful recovery.
const autoRecoveryAttempted = new Set<ErrorCode>();

type SyncState = {
  status: SyncStatus;
  /** Code of the error that last put status into "error" — for SyncBadge copy. */
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
   * THE app-level sync entry point: runs core's fullSync (which only throws
   * typed errors) and owns the reaction policy — session teardown, conflict
   * recovery, offline handling, badge state, error reporting.
   */
  sync(opts?: { force?: boolean }): Promise<void>;

  // -- Recovery from server file-state sync rejections (the appSlice-equivalent
  // recovery ops; upstream desktop-client sync-events + loot-core sync/reset). --
  /** "Upload this device as the new truth" (upstream appSlice `resetSync`). */
  resetSync(): Promise<void>;
  /** "Revert to the server's version" — re-download the file fresh and reopen. */
  redownloadBudget(): Promise<void>;
  /** Single entry point for sync/file-* rejections: auto-recover or raise conflict. */
  handleSyncFileError(code: ErrorCode): Promise<void>;

  _setStatus(status: SyncStatus): void;
  _setErrorCode(code: ErrorCode): void;
  _setConflict(code: ErrorCode): void;
  clearConflict(): void;
  _resolveConflict(): void;
  /** Clear all sync state (incl. the auto-recovery guard) on a budget switch. */
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
    // reaction policy — status transitions, conflict recovery, session
    // teardown. Upstream shape: the desktop sync button dispatches sync() the
    // same way and lets the event listener do the rest.
    await fullSync(opts);
  },

  async resetSync() {
    const { serverUrl, token } = useSessionStore.getState();
    const { activeBudgetId } = useBudgetContextStore.getState();
    const meta = await readMetadata(activeBudgetId);
    if (!meta?.cloudFileId) {
      throw new ActualError("file/upload-failed", { context: { reason: "no cloudFileId" } });
    }

    // Delegate the reset protocol (checkKey guard → server reset → wipe local
    // CRDT state → clear sync metadata → re-upload) to core's resetSync —
    // upstream sync/reset.ts, the same op the encryption flows use. The
    // checkKey guard matters: it refuses to upload a file encrypted with a
    // key the server no longer accepts.
    const { resetSync: coreResetSync } = await import("@/core/sync/reset");
    const result = await coreResetSync({
      serverUrl,
      token,
      cloudFileId: meta.cloudFileId,
      budgetId: activeBudgetId,
    });
    if ("error" in result) {
      const reason = result.error.reason;
      throw new ActualError(
        reason === "network"
          ? "network/offline"
          : reason === "file-has-new-key"
            ? "sync/file-has-new-key"
            : "file/upload-failed",
        { context: { operation: "resetSync", reason } },
      );
    }

    useBudgetContextStore
      .getState()
      .setBudgetContext({ groupId: result.groupId ?? "", lastSyncedTimestamp: undefined });
    // Refresh core's prefs snapshot — the sync engine reads groupId from there.
    const { loadPrefs } = await import("@/core/server/prefs");
    await loadPrefs(activeBudgetId);

    get()._resolveConflict();
    // A rejection here reports through the sync-event listener like any other
    // sync; re-entry into this recovery is bounded by autoRecoveryAttempted.
    await fullSync({ force: true });
  },

  async redownloadBudget() {
    const { serverUrl, token } = useSessionStore.getState();
    const { activeBudgetId } = useBudgetContextStore.getState();
    const meta = await readMetadata(activeBudgetId);
    const cloudFileId = meta?.cloudFileId;
    if (!cloudFileId) {
      throw new ActualError("file/download-failed", { context: { reason: "no cloudFileId" } });
    }

    // The stale local groupId is the whole problem — fetch the server's current
    // file record instead of reusing metadata.
    const files = await getRemoteFiles(serverUrl, token);
    const remote = files.find((f) => f.fileId === cloudFileId && !f.deleted);
    if (!remote) {
      throw new ActualError("file/download-failed", {
        context: { reason: "file no longer exists on server", cloudFileId },
      });
    }

    await useBudgetContextStore.getState().closeBudget();
    const newBudgetId = await downloadBudget(serverUrl, token, remote);
    await deleteBudgetDir(activeBudgetId);

    get()._resolveConflict();
    await useBudgetContextStore.getState().loadBudget(newBudgetId);
  },

  async handleSyncFileError(code) {
    switch (code) {
      case "sync/file-has-reset":
      case "sync/file-has-new-key":
      case "sync/file-old-version":
        get()._setConflict(code);
        return;

      case "sync/file-needs-upload":
      case "sync/file-not-found": {
        // Server lost/never had the sync state for this file — this device's
        // copy is the only candidate, so re-registering it is safe to automate
        // (upstream's "Upload"/"Register" notification buttons).
        if (autoRecoveryAttempted.has(code)) {
          get()._setConflict(code);
          return;
        }
        autoRecoveryAttempted.add(code);
        try {
          if (code === "sync/file-needs-upload") {
            await get().resetSync();
          } else {
            const { serverUrl, token } = useSessionStore.getState();
            const { activeBudgetId } = useBudgetContextStore.getState();
            const { groupId } = await uploadBudget(serverUrl, token, activeBudgetId);
            useBudgetContextStore.getState().setBudgetContext({ groupId });
            get()._resolveConflict();
          }
        } catch (e) {
          emitErrorEvent(e, { operation: "syncRecovery.auto", code });
          get()._setConflict(code);
        }
        return;
      }

      case "sync/file-key-mismatch":
        // Key rotated server-side — same UX as sync/key-missing: the reopen
        // flow prompts for the new password.
        get()._setErrorCode("sync/key-missing");
        return;

      default:
        get()._setErrorCode(code);
    }
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
    autoRecoveryAttempted.clear();
    get().clearConflict();
    set({ lastErrorCode: null });
    get()._setStatus("idle");
    setSyncingMode("enabled");
  },

  resetForBudgetSwitch() {
    // A conflict, error badge, or lastSync from budget A must never leak into
    // budget B: the dialog would pause B's syncs and its recovery actions
    // would operate on B with A's conflict. Called by loadBudget before
    // opening the new database. The auto-recovery guard is per-budget too.
    autoRecoveryAttempted.clear();
    set({ status: "idle", lastErrorCode: null, conflictCode: null, lastSync: null });
  },
}));
