// Platform capability contract: device-global key/value store. Mirrors
// upstream's platform/server/asyncStorage — the backend for GlobalPrefs
// (per-device, cross-budget). Upstream is async (IndexedDB /
// global-store.json); the mobile implementation over MMKV is synchronous, so
// this contract is sync. The GlobalPrefs engine layers the typed
// camelCase↔kebab mapping on top of this generic string KV.
export interface PlatformAsyncStorage {
  getItem(key: string): string | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  multiGet(keys: string[]): Record<string, string | undefined>;
  multiSet(entries: Array<[string, string]>): void;
  getAllKeys(): string[];
}
