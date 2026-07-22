import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { clearAllKeys as clearEncryptionKeys } from "@/core/platform/keyStore";
import { unloadAllKeys } from "@/core/encryption";
import { mmkvStorage, SECURE_TOKEN_KEY } from "./prefsStorage";

// Key material must not leave this device (no backup migration) and must be
// unreadable while locked. Applied at write time; items re-adopt it on rewrite.
const SECURE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

// ---------------------------------------------------------------------------
// Session store — the connection to a server: URL + auth token.
// ---------------------------------------------------------------------------
// The token is in-memory only; it is persisted in the iOS Keychain / Android
// Keystore via expo-secure-store, never in MMKV. Only `serverUrl` is persisted.
// `hasToken` is the single reactive signal the auth guard needs; the network
// layer reads serverUrl/token imperatively via getState().

// This store is the mobile usersSlice: session state + its operations
// (`loggedIn`, `signOut`) live together as store actions (idiomatic Zustand).
type SessionState = {
  serverUrl: string;
  token: string;
  hasToken: boolean;

  setServerUrl(url: string): void;
  /** Load token from SecureStore into state. Call once during app bootstrap. */
  loadToken(): Promise<void>;
  /** Save token to SecureStore and update state. */
  saveToken(token: string): Promise<void>;
  reset(): void;

  /**
   * Finalize an authenticated session: we already have a serverUrl + token, so
   * persist them and leave the app ready (upstream usersSlice `loggedIn`).
   * Navigation is the caller's job.
   */
  loggedIn(params: { serverUrl: string; token: string }): Promise<void>;
  /**
   * Full sign-out: wipe the token + encryption keys and reset the session and
   * budget-context stores (upstream usersSlice `signOut`). UI prefs (theme,
   * language, onboarding) are preserved by design. Navigation is the caller's job.
   */
  signOut(): Promise<void>;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      serverUrl: "",
      token: "",
      hasToken: false,

      setServerUrl(url: string) {
        set((state) => ({ serverUrl: url, hasToken: !!(url && state.token) }));
      },

      async loadToken() {
        const token = (await SecureStore.getItemAsync(SECURE_TOKEN_KEY)) ?? "";
        set((state) => ({ token, hasToken: !!(state.serverUrl && token) }));
      },

      async saveToken(token: string) {
        if (token) {
          await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token, SECURE_OPTS);
        } else {
          await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        }
        set((state) => ({ token, hasToken: !!(state.serverUrl && token) }));
      },

      reset() {
        set({ serverUrl: "", token: "", hasToken: false });
      },

      async loggedIn({ serverUrl, token }) {
        get().setServerUrl(serverUrl);
        await get().saveToken(token);
      },

      async signOut() {
        await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        await clearEncryptionKeys();
        unloadAllKeys();

        get().reset();
        // Dynamic import breaks the sessionStore <-> budgetContextStore cycle.
        const { useBudgetContextStore } = await import("@/stores/budgetContextStore");
        useBudgetContextStore.getState().reset();
      },
    }),
    {
      name: "session",
      storage: mmkvStorage,
      // Token stays in SecureStore; only persist the server URL.
      partialize: (state) => ({ serverUrl: state.serverUrl }),
    },
  ),
);
