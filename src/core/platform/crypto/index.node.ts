// Node/test implementation of the crypto capability. Deterministic on
// purpose: fixed random bytes make encryption tests reproducible, and
// incrementing UUIDs keep related rows (category + group + account) from
// colliding on a shared primary key while staying predictable.
//
// Selected by the vitest resolve.alias for `@/core/platform/crypto`.
import type { PlatformCrypto } from "./types";

let uuidCounter = 0;

export const crypto: PlatformCrypto = {
  randomUUID: () => {
    uuidCounter += 1;
    return `mock-uuid-${uuidCounter}`;
  },
  getRandomBytes: () => new Uint8Array(16),
};

export const { randomUUID, getRandomBytes } = crypto;
