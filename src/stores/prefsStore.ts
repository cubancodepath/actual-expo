import { create } from 'zustand';
import { loadPrefs, savePrefs, type Prefs } from '../prefs';

type PrefsState = Prefs & {
  isConfigured: boolean;
  setPrefs(prefs: Partial<Prefs>): void;
  loadFromStorage(): Promise<void>;
  saveToStorage(): Promise<void>;
};

export const usePrefsStore = create<PrefsState>((set, get) => ({
  serverUrl: '',
  token: '',
  fileId: '',
  groupId: '',
  encryptKeyId: undefined,
  lastSyncedTimestamp: undefined,
  isConfigured: false,

  setPrefs(prefs) {
    set(state => {
      const next = { ...state, ...prefs };
      const isConfigured = !!(next.serverUrl && next.token && next.fileId && next.groupId);
      return { ...next, isConfigured };
    });
  },

  async loadFromStorage() {
    const saved = await loadPrefs();
    const isConfigured = !!(saved.serverUrl && saved.token && saved.fileId && saved.groupId);
    set({ ...saved, isConfigured });
  },

  async saveToStorage() {
    const { serverUrl, token, fileId, groupId, encryptKeyId, lastSyncedTimestamp } = get();
    await savePrefs({ serverUrl, token, fileId, groupId, encryptKeyId, lastSyncedTimestamp });
  },
}));
