import { createMMKV } from "react-native-mmkv";
import { createJSONStorage } from "zustand/middleware";

// ---------------------------------------------------------------------------
// Shared MMKV storage for the prefs-family stores
// ---------------------------------------------------------------------------
// Concern-specific stores (session / budget-context / ui-prefs) each persist
// their own slice under their own key inside this one MMKV instance. The auth
// token is NOT persisted here — it lives in expo-secure-store.

export const prefsMMKV = createMMKV({ id: "actual-prefs" });

// Synchronous MMKV adapter — Zustand persist hydrates immediately on startup.
export const mmkvStorage = createJSONStorage(() => ({
  getItem: (name: string) => prefsMMKV.getString(name) ?? null,
  setItem: (name: string, value: string) => prefsMMKV.set(name, value),
  removeItem: (name: string) => prefsMMKV.remove(name),
}));

export const SECURE_TOKEN_KEY = "actual-token";
