import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createMMKV } from "react-native-mmkv";
import * as SecureStore from "expo-secure-store";
import { clearAllKeys as clearEncryptionKeys } from "../services/encryptionKeyStorage";
import { unloadAllKeys } from "@core/encryption";
import { resolveFeatures, type ServerFeatures } from "../services/serverFeatures";

// ---------------------------------------------------------------------------
// Storage adapters
// ---------------------------------------------------------------------------

const mmkv = createMMKV({ id: "actual-prefs" });

// Synchronous MMKV adapter — Zustand persist hydrates immediately on startup
const mmkvStorage = createJSONStorage(() => ({
  getItem: (name: string) => mmkv.getString(name) ?? null,
  setItem: (name: string, value: string) => mmkv.set(name, value),
  removeItem: (name: string) => mmkv.remove(name),
}));

const SECURE_TOKEN_KEY = "actual-token";

// ---------------------------------------------------------------------------
// Store type
// ---------------------------------------------------------------------------

type PrefsState = {
  // Config — persisted in MMKV (non-sensitive)
  serverUrl: string;
  activeBudgetId: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  budgetName?: string;
  showProgressBars: boolean;
  hideReconciled: boolean;
  showHiddenCategories: boolean;
  hasSeenOnboarding: boolean;
  isLocalOnly: boolean;
  themeMode: "system" | "light" | "dark";
  language: "system" | "en" | "es";
  serverVersion: string;

  // Token — in-memory only; persisted in iOS Keychain / Android Keystore
  token: string;

  // Derived
  hasToken: boolean;
  isConfigured: boolean;
  serverFeatures: ServerFeatures;

  // Actions
  setPrefs(
    prefs: Partial<
      Omit<PrefsState, "isConfigured" | "setPrefs" | "loadToken" | "saveToken" | "clearAll">
    >,
  ): void;
  /** Load token from SecureStore into state. Call once during app bootstrap. */
  loadToken(): Promise<void>;
  /** Save token to SecureStore and update state. */
  saveToken(token: string): Promise<void>;
  setLanguage(lang: "system" | "en" | "es"): void;
  toggleProgressBars(): void;
  toggleHideReconciled(): void;
  toggleShowHiddenCategories(): void;
  setServerVersion(version: string): void;
  markOnboardingSeen(): void;
  /** Full logout: wipe MMKV + SecureStore and reset state. */
  clearAll(): Promise<void>;
};

function computeIsConfigured(
  s: Pick<PrefsState, "serverUrl" | "token" | "activeBudgetId" | "isLocalOnly">,
): boolean {
  if (s.isLocalOnly) return true;
  return !!(s.serverUrl && s.token && s.activeBudgetId);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      serverUrl: "",
      token: "",
      activeBudgetId: "",
      fileId: "",
      groupId: "",
      encryptKeyId: undefined,
      lastSyncedTimestamp: undefined,
      showProgressBars: true,
      hideReconciled: false,
      showHiddenCategories: false,
      hasSeenOnboarding: false,
      isLocalOnly: false,
      themeMode: "system",
      language: "system",
      serverVersion: "0.0.0",
      hasToken: false,
      isConfigured: false,
      serverFeatures: resolveFeatures("0.0.0"),

      setPrefs(prefs) {
        set((state) => {
          const next = { ...state, ...prefs };
          return {
            ...next,
            hasToken: !!(next.serverUrl && next.token),
            isConfigured: computeIsConfigured(next),
          };
        });
      },

      setLanguage(lang: "system" | "en" | "es") {
        set({ language: lang });
        // i18n language change is handled by the caller (settings screen)
        // to avoid circular imports between prefsStore and i18n/config
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

      setServerVersion(version: string) {
        set({ serverVersion: version, serverFeatures: resolveFeatures(version) });
      },

      markOnboardingSeen() {
        set({ hasSeenOnboarding: true });
      },

      async loadToken() {
        const token = (await SecureStore.getItemAsync(SECURE_TOKEN_KEY)) ?? "";
        const s = get();
        set({
          token,
          hasToken: !!(s.serverUrl && token),
          isConfigured: computeIsConfigured({ ...s, token }),
        });
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
        const { hasSeenOnboarding, themeMode, language } = get();
        await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        await clearEncryptionKeys();
        unloadAllKeys();

        set({
          serverUrl: "",
          token: "",
          activeBudgetId: "",
          fileId: "",
          groupId: "",
          encryptKeyId: undefined,
          lastSyncedTimestamp: undefined,
          budgetName: undefined,
          showProgressBars: true,
          hideReconciled: false,
          showHiddenCategories: false,
          serverVersion: "0.0.0",
          isLocalOnly: false,
          hasToken: false,
          isConfigured: false,
          serverFeatures: resolveFeatures("0.0.0"),
          hasSeenOnboarding,
          themeMode,
          language,
        });
      },
    }),
    {
      name: "actual-prefs",
      storage: mmkvStorage,
      // Only persist non-sensitive config to MMKV. Token stays in SecureStore.
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        activeBudgetId: state.activeBudgetId,
        fileId: state.fileId,
        groupId: state.groupId,
        encryptKeyId: state.encryptKeyId,
        lastSyncedTimestamp: state.lastSyncedTimestamp,
        budgetName: state.budgetName,
        showProgressBars: state.showProgressBars,
        hideReconciled: state.hideReconciled,
        showHiddenCategories: state.showHiddenCategories,
        hasSeenOnboarding: state.hasSeenOnboarding,
        serverVersion: state.serverVersion,
        isLocalOnly: state.isLocalOnly,
        themeMode: state.themeMode,
        language: state.language,
      }),
    },
  ),
);
