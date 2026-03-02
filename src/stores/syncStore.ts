import { create } from 'zustand';
import { fullSync } from '../sync';

type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';

type SyncState = {
  status: SyncStatus;
  refreshing: boolean;  // true only during explicit sync() calls (pull-to-refresh / manual)
  error: string | null;
  lastSync: Date | null;
  sync(): Promise<void>;
  _setStatus(status: SyncStatus): void;
  _setError(error: string): void;
};

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  refreshing: false,
  error: null,
  lastSync: null,

  async sync() {
    set({ status: 'syncing', refreshing: true, error: null });
    try {
      await fullSync();
      set({ status: 'success', refreshing: false, lastSync: new Date() });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ status: 'error', refreshing: false, error: msg });
    }
  },

  _setStatus(status) {
    set({ status });
    if (status === 'success') set({ lastSync: new Date() });
  },

  _setError(error) {
    set({ status: 'error', error });
  },
}));
