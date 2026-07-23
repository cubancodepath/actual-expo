// Native implementation of the key-store capability, backed by
// expo-secure-store (Keychain/Keystore) so key material is hardware-backed
// and never leaves the device. The only module in src/core allowed to import
// the native secure-store dependency. In vitest the whole module is swapped
// for `./index.node.ts` via resolve.alias.
import * as SecureStore from "expo-secure-store";

import type { PlatformKeyStore, SerializedKey } from "./types";

export type { SerializedKey } from "./types";

const INDEX_KEY = "encrypt-key-index";
const KEY_PREFIX = "encrypt-key-";

// Key material must not leave this device (no backup migration) and must be
// unreadable while locked. Applied at write time; items re-adopt it on rewrite.
const SECURE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

// Secure-store has no listing API, so the capability keeps its own index of
// stored key ids (capability logic, not driver logic).
async function getIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function setIndex(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids), SECURE_OPTS);
}

export const keyStore: PlatformKeyStore = {
  saveKey: async (cloudFileId, key) => {
    await SecureStore.setItemAsync(KEY_PREFIX + cloudFileId, JSON.stringify(key), SECURE_OPTS);
    const index = await getIndex();
    if (!index.includes(cloudFileId)) {
      index.push(cloudFileId);
      await setIndex(index);
    }
  },

  getKey: async (cloudFileId) => {
    const raw = await SecureStore.getItemAsync(KEY_PREFIX + cloudFileId);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  getAllKeys: async () => {
    const index = await getIndex();
    const result: Record<string, SerializedKey> = {};
    for (const fileId of index) {
      const key = await keyStore.getKey(fileId);
      if (key) result[fileId] = key;
    }
    return result;
  },

  removeKey: async (cloudFileId) => {
    await SecureStore.deleteItemAsync(KEY_PREFIX + cloudFileId);
    const index = await getIndex();
    await setIndex(index.filter((id) => id !== cloudFileId));
  },

  clearAllKeys: async () => {
    const index = await getIndex();
    for (const fileId of index) {
      await SecureStore.deleteItemAsync(KEY_PREFIX + fileId);
    }
    await SecureStore.deleteItemAsync(INDEX_KEY);
  },
};

export const { saveKey, getKey, getAllKeys, removeKey, clearAllKeys } = keyStore;
