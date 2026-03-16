import { create } from "zustand";
import { fullSync } from "../sync";

type SyncStatus = "idle" | "syncing" | "error" | "success";

type SyncState = {
  status: SyncStatus;
  error: string | null;
  lastSync: Date | null;
  sync(): Promise<void>;
  _setStatus(status: SyncStatus): void;
  _setError(error: string): void;
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
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: "error", error: msg });
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
