// Platform capability contract: encryption-key persistence. Mirrors
// upstream's `#platform/server/asyncStorage` `encrypt-keys` map; on mobile
// the native implementation is hardware-backed (Keychain/Keystore). Each
// target ships an object conforming to this interface (index.ts = native,
// index.node.ts = in-memory Node/test implementation).
export type SerializedKey = { id: string; base64: string };

export interface PlatformKeyStore {
  saveKey(cloudFileId: string, key: SerializedKey): Promise<void>;
  getKey(cloudFileId: string): Promise<SerializedKey | null>;
  getAllKeys(): Promise<Record<string, SerializedKey>>;
  removeKey(cloudFileId: string): Promise<void>;
  clearAllKeys(): Promise<void>;
}
