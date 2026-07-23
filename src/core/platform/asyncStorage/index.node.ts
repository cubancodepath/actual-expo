// Node/test implementation of the asyncStorage capability: an in-memory
// string map with the same synchronous semantics as the MMKV adapter.
//
// Selected by the vitest resolve.alias for `@/core/platform/asyncStorage`.
import type { PlatformAsyncStorage } from "./types";

const store = new Map<string, string>();

export const asyncStorage: PlatformAsyncStorage = {
  getItem: (key) => store.get(key),
  setItem: (key, value) => {
    store.set(key, value);
  },
  removeItem: (key) => {
    store.delete(key);
  },
  multiGet: (keys) => {
    const out: Record<string, string | undefined> = {};
    for (const key of keys) out[key] = store.get(key);
    return out;
  },
  multiSet: (entries) => {
    for (const [key, value] of entries) store.set(key, value);
  },
  getAllKeys: () => [...store.keys()],
};

export const { getItem, setItem, removeItem, multiGet, multiSet, getAllKeys } = asyncStorage;
