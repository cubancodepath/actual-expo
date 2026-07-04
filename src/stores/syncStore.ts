import { create } from "zustand";
import { fullSync } from "@/core/sync";
import { reportError, type ErrorCode } from "@/core/errors";

type SyncStatus = "idle" | "syncing" | "error" | "success";

type SyncState = {
  status: SyncStatus;
  /** Code of the error that last put status into "error" — for SyncBadge copy. */
  lastErrorCode: ErrorCode | null;
  lastSync: Date | null;
  sync(): Promise<void>;
  _setStatus(status: SyncStatus): void;
  _setErrorCode(code: ErrorCode): void;
};

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  lastErrorCode: null,
  lastSync: null,

  async sync() {
    set({ status: "syncing", lastErrorCode: null });
    try {
      await fullSync();
      set({ status: "success", lastSync: new Date() });
    } catch (e: unknown) {
      const error = reportError(e);
      set({ status: "error", lastErrorCode: error.code });
    }
  },

  _setStatus(status) {
    set({ status });
    if (status === "success") set({ lastSync: new Date() });
  },

  _setErrorCode(code) {
    set({ status: "error", lastErrorCode: code });
  },
}));
