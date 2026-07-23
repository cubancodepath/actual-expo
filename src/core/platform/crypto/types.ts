// Platform capability contract: cryptographic primitives (random UUIDs +
// secure random bytes). Core code programs against THIS interface; each
// target ships an object that conforms to it (index.ts = Expo native,
// index.node.ts = deterministic Node/test implementation). The vitest
// resolver swaps the module at the seam, so tests never see a native API.
export interface PlatformCrypto {
  randomUUID(): string;
  getRandomBytes(byteCount: number): Uint8Array;
}
