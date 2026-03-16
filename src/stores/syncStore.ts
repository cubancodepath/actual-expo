import { create } from "zustand";
import { fullSync } from "../sync";
import { toAppError } from "../errors";
import type { AppError } from "../errors";

type SyncStatus = "idle" | "syncing" | "error" | "success";

type SyncState = {
  status: SyncStatus;
  error: AppError | null;
  lastSync: Date | null;
  sync(): Promise<void>;
  _setStatus(status: SyncStatus): void;
  _setError(error: AppError): void;
};

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  error: null,
  lastSync: null,

  async sync() {
    set({ status: "syncing", error: null });
    try {
      await fullSync();
      set({ status: "success", lastSync: new Date() });
    } catch (e: unknown) {
      set({ status: "error", error: toAppError(e) });
    }
  },

  _setStatus(status) {
    set({ status });
    if (status === "success") set({ lastSync: new Date() });
  },

  _setError(error) {
    set({ status: "error", error });
  },
}));
