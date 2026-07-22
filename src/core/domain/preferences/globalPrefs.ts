// GlobalPrefs engine — per-device, cross-budget preferences. Faithful to
// upstream's server/preferences global-prefs handling: values persist in a
// device-global key/value store (here `@/core/platform/asyncStorage` over MMKV)
// under the kebab-case storage names upstream uses in GlobalPrefsJson.
//
// Pure core logic (no React). The `useGlobalPref` hook wraps these.
import * as asyncStorage from "@/core/platform/asyncStorage";

import type { GlobalPrefs } from "./prefs.types";

/** camelCase pref name → kebab-case storage key (mirrors upstream GlobalPrefsJson). */
const STORAGE_KEY: Record<keyof GlobalPrefs, string> = {
  maxMonths: "max-months",
  language: "language",
  theme: "theme",
  preferredDarkTheme: "preferred-dark-theme",
  notifyWhenUpdateIsAvailable: "notify-when-update-is-available",
};

/** Deserialize a stored string back to its typed GlobalPrefs value. */
function parse<K extends keyof GlobalPrefs>(key: K, raw: string): GlobalPrefs[K] {
  switch (key) {
    case "maxMonths":
      return Number(raw) as GlobalPrefs[K];
    case "notifyWhenUpdateIsAvailable":
      return (raw === "true") as GlobalPrefs[K];
    default:
      return raw as GlobalPrefs[K];
  }
}

export function getGlobalPref<K extends keyof GlobalPrefs>(key: K): GlobalPrefs[K] | undefined {
  const raw = asyncStorage.getItem(STORAGE_KEY[key]);
  return raw === undefined ? undefined : parse(key, raw);
}

export function setGlobalPref<K extends keyof GlobalPrefs>(key: K, value: GlobalPrefs[K]): void {
  if (value === undefined) {
    asyncStorage.removeItem(STORAGE_KEY[key]);
    return;
  }
  asyncStorage.setItem(STORAGE_KEY[key], String(value));
}

export function getAllGlobalPrefs(): GlobalPrefs {
  const keys = Object.keys(STORAGE_KEY) as Array<keyof GlobalPrefs>;
  const out: GlobalPrefs = {};
  for (const key of keys) {
    const value = getGlobalPref(key);
    if (value !== undefined) (out[key] as GlobalPrefs[typeof key]) = value;
  }
  return out;
}
