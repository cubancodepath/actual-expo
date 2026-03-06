import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

// ---------------------------------------------------------------------------
// Storage adapters
// ---------------------------------------------------------------------------

const mmkv = createMMKV({ id: 'actual-prefs' });

// Synchronous MMKV adapter — Zustand persist hydrates immediately on startup
const mmkvStorage = createJSONStorage(() => ({
  getItem: (name: string) => mmkv.getString(name) ?? null,
  setItem: (name: string, value: string) => mmkv.set(name, value),
  removeItem: (name: string) => mmkv.remove(name),
}));

const SECURE_TOKEN_KEY = 'actual-token';

// ---------------------------------------------------------------------------
// Store type
// ---------------------------------------------------------------------------

type PrefsState = {
  // Config — persisted in MMKV (non-sensitive)
  serverUrl: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  budgetName?: string;
  showProgressBars: boolean;
  hideReconciled: boolean;
  showHiddenCategories: boolean;

  // Token — in-memory only; persisted in iOS Keychain / Android Keystore
  token: string;

  // Derived
  hasToken: boolean;
  isConfigured: boolean;

  // Actions
  setPrefs(prefs: Partial<Omit<PrefsState, 'isConfigured' | 'setPrefs' | 'loadToken' | 'saveToken' | 'clearAll'>>): void;
  /** Load token from SecureStore into state. Call once during app bootstrap. */
  loadToken(): Promise<void>;
  /** Save token to SecureStore and update state. */
  saveToken(token: string): Promise<void>;
  toggleProgressBars(): void;
  toggleHideReconciled(): void;
  toggleShowHiddenCategories(): void;
  /** Full logout: wipe MMKV + SecureStore and reset state. */
  clearAll(): Promise<void>;
};

function computeIsConfigured(s: Pick<PrefsState, 'serverUrl' | 'token' | 'fileId' | 'groupId'>): boolean {
  return !!(s.serverUrl && s.token && s.fileId && s.groupId);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      serverUrl: '',
      token: '',
      fileId: '',
      groupId: '',
      encryptKeyId: undefined,
      lastSyncedTimestamp: undefined,
      showProgressBars: true,
      hideReconciled: false,
      showHiddenCategories: false,
      hasToken: false,
      isConfigured: false,

      setPrefs(prefs) {
        set(state => {
          const next = { ...state, ...prefs };
          return { ...next, hasToken: !!(next.serverUrl && next.token), isConfigured: computeIsConfigured(next) };
        });
      },

      toggleProgressBars() {
        set((state) => ({ showProgressBars: !state.showProgressBars }));
      },

      toggleHideReconciled() {
        set((state) => ({ hideReconciled: !state.hideReconciled }));
      },

      toggleShowHiddenCategories() {
        set((state) => ({ showHiddenCategories: !state.showHiddenCategories }));
      },

      async loadToken() {
        const token = (await SecureStore.getItemAsync(SECURE_TOKEN_KEY)) ?? '';
        const s = get();
        set({ token, hasToken: !!(s.serverUrl && token), isConfigured: computeIsConfigured({ ...s, token }) });
      },

      async saveToken(token: string) {
        if (token) {
          await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
        } else {
          await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        }
        get().setPrefs({ token });
      },

      async clearAll() {
        mmkv.clearAll();
        await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        set({
          serverUrl: '',
          token: '',
          fileId: '',
          groupId: '',
          encryptKeyId: undefined,
          lastSyncedTimestamp: undefined,
          hasToken: false,
          isConfigured: false,
        });
      },
    }),
    {
      name: 'actual-prefs',
      storage: mmkvStorage,
      // Only persist non-sensitive config to MMKV. Token stays in SecureStore.
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        fileId: state.fileId,
        groupId: state.groupId,
        encryptKeyId: state.encryptKeyId,
        lastSyncedTimestamp: state.lastSyncedTimestamp,
        budgetName: state.budgetName,
        showProgressBars: state.showProgressBars,
        hideReconciled: state.hideReconciled,
        showHiddenCategories: state.showHiddenCategories,
      }),
    },
  ),
);
