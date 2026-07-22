// Platform capability: cryptographic primitives (random UUIDs + secure random
// bytes). Mirrors upstream's platform abstraction (loot-core/src/platform):
// core code imports THIS interface, never the native module directly, so the
// engine stays pure and the native dependency lives only in `index.ts`.

export declare function randomUUID(): string;
export type RandomUUID = typeof randomUUID;

export declare function getRandomBytes(byteCount: number): Uint8Array;
export type GetRandomBytes = typeof getRandomBytes;
