import { create } from "zustand";
import { post } from "@/core/post";
import { clearLocalSyncState, fullSync, setSyncingMode } from "@/core/sync";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";
import { readMetadata, updateMetadata, deleteBudgetDir } from "@/core/server/prefs";
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

    set({ status: "syncing", lastErrorCode: null });
    try {
      await fullSync(opts);
      set({ status: "success", lastSync: new Date() });
    } catch (e: unknown) {
      if (e instanceof ActualError && e.code === "auth/token-expired") {
        // Session teardown, not a user-visible error.
        emitErrorEvent(e);
        set({ status: "idle" });
        await useBudgetContextStore
          .getState()
          .closeBudget()
          .catch(() => {});
        await useSessionStore.getState().signOut();
        return;
      }

      if (e instanceof ActualError && e.code.startsWith("sync/file-")) {
        // Server file-state rejection (reset/re-encrypted/format change on
        // another client). handleSyncFileError pauses scheduled syncs and
        // either auto-recovers or raises the conflict dialog via conflictCode.
        emitErrorEvent(e);
        await get().handleSyncFileError(e.code);
        return;
      }

      if (e instanceof ActualError && e.code === "network/offline") {
        // Expected local-first condition — log only, no error badge.
        emitErrorEvent(e);
        set({ status: "idle" });
        return;
      }

      emitErrorEvent(e);
      set({ status: "error", lastErrorCode: toErrorCode(e) });
    }
  },

  async resetSync() {
    const { serverUrl, token } = useSessionStore.getState();
    const { activeBudgetId } = useBudgetContextStore.getState();
    const meta = await readMetadata(activeBudgetId);
    if (!meta?.cloudFileId) {
      throw new ActualError("file/upload-failed", { context: { reason: "no cloudFileId" } });
    }

    await post(`${serverUrl}/sync/reset-user-file`, { token, fileId: meta.cloudFileId });

    await clearLocalSyncState();
    await updateMetadata(activeBudgetId, {
      groupId: undefined,
      lastSyncedTimestamp: undefined,
      lastUploaded: undefined,
    });
    useBudgetContextStore
      .getState()
      .setBudgetContext({ groupId: "", lastSyncedTimestamp: undefined });

    const { groupId } = await uploadBudget(serverUrl, token, activeBudgetId);
    useBudgetContextStore.getState().setBudgetContext({ groupId });
    // Refresh core's prefs snapshot — the sync engine reads groupId from there.
    const { loadPrefs } = await import("@/core/server/prefs");
    await loadPrefs(activeBudgetId);

    get()._resolveConflict();
    // Direct fullSync (not get().sync): a sync/file-* rejection here must not
    // re-enter the recovery policy that called us. Report-only.
    await fullSync({ force: true }).catch((e) => emitErrorEvent(e));
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
    // Pause scheduled syncs while the conflict is unresolved. "offline", not
    // "disabled": applyMessages keeps recording local mutations in the CRDT
    // log, so nothing is lost whichever way the user resolves.
    setSyncingMode("offline");

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
  },

  _setErrorCode(code) {
    set({ status: "error", lastErrorCode: code });
  },

  _setConflict(code) {
    set({ status: "error", lastErrorCode: code, conflictCode: code });
  },

  clearConflict() {
    set({ conflictCode: null });
  },

  _resolveConflict() {
    autoRecoveryAttempted.clear();
    get().clearConflict();
    get()._setStatus("idle");
    setSyncingMode("enabled");
  },
}));
