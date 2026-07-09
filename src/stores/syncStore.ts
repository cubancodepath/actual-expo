import { create } from "zustand";
import { fullSync } from "@/core/sync";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";

type SyncStatus = "idle" | "syncing" | "error" | "success";

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
  _setStatus(status: SyncStatus): void;
  _setErrorCode(code: ErrorCode): void;
  _setConflict(code: ErrorCode): void;
  clearConflict(): void;
};

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  lastErrorCode: null,
  conflictCode: null,
  lastSync: null,

  async sync(opts) {
    const force = opts?.force ?? false;

    // An unresolved file-state conflict pauses all scheduled syncs — only the
    // SyncConflictDialog's recovery actions (which clear it) may sync again.
    if (!force && useSyncStore.getState().conflictCode) return;

    set({ status: "syncing", lastErrorCode: null });
    try {
      await fullSync(opts);
      set({ status: "success", lastSync: new Date() });
    } catch (e: unknown) {
      if (e instanceof ActualError && e.code === "auth/token-expired") {
        // Session teardown, not a user-visible error.
        emitErrorEvent(e);
        set({ status: "idle" });
        const { closeBudget } = await import("@/services/budgetfiles");
        await closeBudget().catch(() => {});
        const { logout } = await import("@/services/authService");
        await logout();
        return;
      }

      if (e instanceof ActualError && e.code.startsWith("sync/file-")) {
        // Server file-state rejection (reset/re-encrypted/format change on
        // another client). Recovery is owned by syncRecovery: it pauses
        // scheduled syncs and either auto-recovers or raises the conflict
        // dialog via conflictCode.
        emitErrorEvent(e);
        const { handleSyncFileError } = await import("@/services/syncRecovery");
        await handleSyncFileError(e.code);
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
}));
