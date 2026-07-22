// RN implementation of the asyncStorage capability, backed by react-native-mmkv
// (a dedicated device-global instance). This is the ONLY module in src/core
// that imports the native MMKV dependency; the GlobalPrefs engine reads/writes
// device-global prefs through here.
//
// (In vitest this resolves to src/__mocks__/react-native-mmkv.ts via the config
// alias, so the platform boundary is transparently mocked in Node tests.)
import { createMMKV } from "react-native-mmkv";

import type * as T from "./index-types";

const storage = createMMKV({ id: "actual-global" });

export const getItem: T.GetItem = (key) => storage.getString(key);

export const setItem: T.SetItem = (key, value) => storage.set(key, value);

export const removeItem: T.RemoveItem = (key) => storage.remove(key);

export const multiGet: T.MultiGet = (keys) => {
  const out: Record<string, string | undefined> = {};
  for (const key of keys) out[key] = storage.getString(key);
  return out;
};

export const multiSet: T.MultiSet = (entries) => {
  for (const [key, value] of entries) storage.set(key, value);
};

export const getAllKeys: T.GetAllKeys = () => storage.getAllKeys();
