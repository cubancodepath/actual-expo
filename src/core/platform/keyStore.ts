/**
 * Encryption-key persistence — the platform boundary for storing E2E keys,
 * mirroring upstream's `#platform/server/asyncStorage` `encrypt-keys` map. On
 * mobile we use the Keychain/Keystore (expo-secure-store) so key material is
 * hardware-backed and never leaves the device.
 */
import * as SecureStore from "expo-secure-store";

const INDEX_KEY = "encrypt-key-index";
const KEY_PREFIX = "encrypt-key-";

// Key material must not leave this device (no backup migration) and must be
// unreadable while locked. Applied at write time; items re-adopt it on rewrite.
const SECURE_OPTS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export type SerializedKey = { id: string; base64: string };

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

export async function saveKey(cloudFileId: string, key: SerializedKey): Promise<void> {
  await SecureStore.setItemAsync(KEY_PREFIX + cloudFileId, JSON.stringify(key), SECURE_OPTS);
  const index = await getIndex();
  if (!index.includes(cloudFileId)) {
    index.push(cloudFileId);
    await setIndex(index);
  }
}

export async function getKey(cloudFileId: string): Promise<SerializedKey | null> {
  const raw = await SecureStore.getItemAsync(KEY_PREFIX + cloudFileId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function getAllKeys(): Promise<Record<string, SerializedKey>> {
  const index = await getIndex();
  const result: Record<string, SerializedKey> = {};
  for (const fileId of index) {
    const key = await getKey(fileId);
    if (key) result[fileId] = key;
  }
  return result;
}

export async function removeKey(cloudFileId: string): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_PREFIX + cloudFileId);
  const index = await getIndex();
  await setIndex(index.filter((id) => id !== cloudFileId));
}

export async function clearAllKeys(): Promise<void> {
  const index = await getIndex();
  for (const fileId of index) {
    await SecureStore.deleteItemAsync(KEY_PREFIX + fileId);
  }
  await SecureStore.deleteItemAsync(INDEX_KEY);
}
