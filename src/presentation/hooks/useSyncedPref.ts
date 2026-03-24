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
import { listen } from "@core/sync/syncEvents";
import {
  getAllPreferences,
  setPreference,
  setArbitraryPref,
  getAllFeatureFlags,
  setFeatureFlag,
} from "@core/preferences";
import { PREFERENCE_DEFAULTS, type PreferenceKey } from "@core/preferences/types";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlag } from "@core/preferences/featureFlags";
import { applyFormatConfig } from "@core/preferences/formatConfig";

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
    const [prefs, flags, allRows] = await Promise.all([
      getAllPreferences(),
      getAllFeatureFlags(),
      // Load ALL preferences (including per-account keys like hide-cleared-xxx)
      import("@core/db").then(({ runQuery }) =>
        runQuery<{ id: string; value: string }>("SELECT id, value FROM preferences"),
      ),
    ]);

    const merged: Record<string, string> = { ...INITIAL_PREFS, ...prefs };
    for (const [flag, val] of Object.entries(flags)) {
      merged[`flags.${flag}`] = String(val);
    }
    // Merge arbitrary prefs (per-account settings, etc.)
    for (const row of allRows) {
      if (!(row.id in merged)) {
        merged[row.id] = row.value;
      }
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
      if (key in PREFERENCE_DEFAULTS) {
        await setPreference(key as PreferenceKey, val);
      } else {
        await setArbitraryPref(key, val);
      }
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
