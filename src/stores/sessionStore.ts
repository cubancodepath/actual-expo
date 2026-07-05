import { create } from "zustand";
import { persist } from "zustand/middleware";
import * as SecureStore from "expo-secure-store";
import { mmkvStorage, SECURE_TOKEN_KEY } from "./prefsStorage";

// ---------------------------------------------------------------------------
// Session store — the connection to a server: URL + auth token.
// ---------------------------------------------------------------------------
// The token is in-memory only; it is persisted in the iOS Keychain / Android
// Keystore via expo-secure-store, never in MMKV. Only `serverUrl` is persisted.
// `hasToken` is the single reactive signal the auth guard needs; the network
// layer reads serverUrl/token imperatively via getState().

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
          await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token);
        } else {
          await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
        }
        set((state) => ({ token, hasToken: !!(state.serverUrl && token) }));
      },

      reset() {
        set({ serverUrl: "", token: "", hasToken: false });
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
