// Node/test implementation of the key-store capability: a functional
// in-memory store (unlike the old no-op secure-store stub), so tests
// exercise real save/get/remove semantics.
//
// Selected by the vitest resolve.alias for `@/core/platform/keyStore`.
import type { PlatformKeyStore, SerializedKey } from "./types";

export type { SerializedKey } from "./types";

const store = new Map<string, SerializedKey>();

export const keyStore: PlatformKeyStore = {
  saveKey: async (cloudFileId, key) => {
    store.set(cloudFileId, key);
  },
  getKey: async (cloudFileId) => store.get(cloudFileId) ?? null,
  getAllKeys: async () => Object.fromEntries(store),
  removeKey: async (cloudFileId) => {
    store.delete(cloudFileId);
  },
  clearAllKeys: async () => {
    store.clear();
  },
};

export const { saveKey, getKey, getAllKeys, removeKey, clearAllKeys } = keyStore;
