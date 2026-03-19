/**
 * useSyncedPref — read/write a single synced preference.
 *
 * Backed by a Zustand store (shared global cache, like Redux in Actual web).
 * The store is loaded during bootstrap and auto-refreshes via syncEvents.
 * Optimistic updates write to the store immediately, then persist to DB.
 *
 * @example
 * const [dateFormat, setDateFormat] = useSyncedPref("dateFormat");
 * const [hideFraction] = useSyncedPref("hideFraction");
 */

import { useCallback } from "react";
import { create } from "zustand";
import { listen } from "@/sync/syncEvents";
import {
  getAllPreferences,
  setPreference,
  getAllFeatureFlags,
  setFeatureFlag,
} from "@/preferences";
import { PREFERENCE_DEFAULTS, type PreferenceKey } from "@/preferences/types";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlag } from "@/preferences/featureFlags";
import { applyFormatConfig } from "@/preferences/formatConfig";

// ---------------------------------------------------------------------------
// Internal Zustand store (global cache for all synced prefs)
// ---------------------------------------------------------------------------

type SyncedPrefsState = {
  prefs: Record<string, string>;
  loaded: boolean;
  load(): Promise<void>;
};

// Build initial defaults (prefs + flags as "flags.xxx")
const INITIAL_PREFS: Record<string, string> = { ...PREFERENCE_DEFAULTS };
for (const [flag, val] of Object.entries(FEATURE_FLAG_DEFAULTS)) {
  INITIAL_PREFS[`flags.${flag}`] = String(val);
}

export const useSyncedPrefsStore = create<SyncedPrefsState>((set) => ({
  prefs: { ...INITIAL_PREFS },
  loaded: false,

  async load() {
    const [prefs, flags] = await Promise.all([getAllPreferences(), getAllFeatureFlags()]);

    const merged: Record<string, string> = { ...INITIAL_PREFS, ...prefs };
    for (const [flag, val] of Object.entries(flags)) {
      merged[`flags.${flag}`] = String(val);
    }

    set({ prefs: merged, loaded: true });
    applyFormatConfig(merged as any);
  },
}));

// Auto-refresh when preferences table changes via syncEvents
listen((event) => {
  if (event.tables.includes("preferences") || event.tables.includes("prefs")) {
    useSyncedPrefsStore.getState().load();
  }
});

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useSyncedPref(key: string): [string, (value: string) => Promise<void>] {
  const value = useSyncedPrefsStore((s) => s.prefs[key] ?? INITIAL_PREFS[key] ?? "");

  const set = useCallback(
    async (val: string) => {
      // Optimistic: update store immediately (all consumers re-render instantly)
      useSyncedPrefsStore.setState((s) => ({
        prefs: { ...s.prefs, [key]: val },
      }));
      // Apply format config immediately for format-related prefs
      applyFormatConfig(useSyncedPrefsStore.getState().prefs as any);
      // Persist to DB (syncEvent → store.load() confirms)
      await setPreference(key as PreferenceKey, val);
    },
    [key],
  );

  return [value, set];
}

/**
 * useFeatureFlag — read a feature flag as boolean.
 * Uses useSyncedPref internally so optimistic updates propagate globally.
 */
export function useFeatureFlag(name: FeatureFlag): [boolean, (enabled: boolean) => Promise<void>] {
  const [value, setPref] = useSyncedPref(`flags.${name}`);
  const set = useCallback(
    async (enabled: boolean) => {
      await setPref(enabled ? "true" : "false");
    },
    [setPref],
  );
  return [value === "true", set];
}
