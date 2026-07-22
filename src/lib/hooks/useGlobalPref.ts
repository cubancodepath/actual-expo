/**
 * useGlobalPref — read/write a single per-device, cross-budget preference.
 *
 * Faithful to upstream `desktop-client/src/hooks/useGlobalPref`: a thin React
 * wrapper over the GlobalPrefs engine (`@/core/domain/preferences/globalPrefs`).
 * A shared Zustand cache mirrors the persisted values so every component using
 * the same key re-renders together when one of them writes it.
 *
 * @example
 * const [theme, setTheme] = useGlobalPref("theme");
 */
import { useCallback } from "react";
import { create } from "zustand";
import { getGlobalPref, setGlobalPref } from "@/core/domain/preferences/globalPrefs";
import type { GlobalPrefs } from "@/core/domain/preferences/prefs.types";

// Shared cache of already-read/written values (keyed by pref name). Values not
// present here are read straight from storage in the selector (MMKV is sync).
const useGlobalPrefsCache = create<{ prefs: Partial<GlobalPrefs> }>(() => ({ prefs: {} }));

export function useGlobalPref<K extends keyof GlobalPrefs>(
  key: K,
): [GlobalPrefs[K] | undefined, (value: GlobalPrefs[K]) => void] {
  const value = useGlobalPrefsCache((s) => (key in s.prefs ? s.prefs[key] : getGlobalPref(key)));

  const set = useCallback(
    (next: GlobalPrefs[K]) => {
      setGlobalPref(key, next);
      useGlobalPrefsCache.setState((s) => ({ prefs: { ...s.prefs, [key]: next } }));
    },
    [key],
  );

  return [value as GlobalPrefs[K] | undefined, set];
}
