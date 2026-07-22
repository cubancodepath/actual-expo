// Platform capability: device-global key/value store. Mirrors upstream's
// platform/server/asyncStorage — the backend for GlobalPrefs (per-device,
// cross-budget). Upstream is async (IndexedDB / global-store.json); the RN
// implementation over MMKV is synchronous, so these are sync. The capability
// name is kept for parity with upstream; the GlobalPrefs engine layers the
// typed camelCase↔kebab mapping on top of this generic string KV.

export declare function getItem(key: string): string | undefined;
export type GetItem = typeof getItem;

export declare function setItem(key: string, value: string): void;
export type SetItem = typeof setItem;

export declare function removeItem(key: string): void;
export type RemoveItem = typeof removeItem;

export declare function multiGet(keys: string[]): Record<string, string | undefined>;
export type MultiGet = typeof multiGet;

export declare function multiSet(entries: Array<[string, string]>): void;
export type MultiSet = typeof multiSet;

export declare function getAllKeys(): string[];
export type GetAllKeys = typeof getAllKeys;
