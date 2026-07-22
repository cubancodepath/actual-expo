import * as encryption from "@/core/encryption";
import * as keyStore from "@/core/platform/keyStore";

/**
 * Load persisted encryption keys into the in-memory registry. Mobile
 * persistence layer (no direct upstream name) over `@/core/platform/keyStore`.
 */

/** Load a persisted key for a budget. Returns true if found and loaded. */
export async function loadKeyForBudget(cloudFileId: string): Promise<boolean> {
  if (!cloudFileId) return false;
  const stored = await keyStore.getKey(cloudFileId);
  if (!stored) return false;

  if (!encryption.hasKey(stored.id)) {
    await encryption.loadKey(stored);
  }
  return true;
}

/** Load all persisted encryption keys into memory. Called once at bootstrap. */
export async function loadAllPersistedKeys(): Promise<void> {
  const allKeys = await keyStore.getAllKeys();
  for (const key of Object.values(allKeys)) {
    if (!encryption.hasKey(key.id)) {
      await encryption.loadKey(key);
    }
  }
}
