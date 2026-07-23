// Native implementation of the asyncStorage capability, backed by
// react-native-mmkv (a dedicated device-global instance). The only module in
// src/core that imports the native MMKV dependency; the GlobalPrefs engine
// reads/writes device-global prefs through here. In vitest the whole module
// is swapped for `./index.node.ts` via resolve.alias.
import { createMMKV } from "react-native-mmkv";

import type { PlatformAsyncStorage } from "./types";

const storage = createMMKV({ id: "actual-global" });

export const asyncStorage: PlatformAsyncStorage = {
  getItem: (key) => storage.getString(key),
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.remove(key),
  multiGet: (keys) => {
    const out: Record<string, string | undefined> = {};
    for (const key of keys) out[key] = storage.getString(key);
    return out;
  },
  multiSet: (entries) => {
    for (const [key, value] of entries) storage.set(key, value);
  },
  getAllKeys: () => storage.getAllKeys(),
};

export const { getItem, setItem, removeItem, multiGet, multiSet, getAllKeys } = asyncStorage;
