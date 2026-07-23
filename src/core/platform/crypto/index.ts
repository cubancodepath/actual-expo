// Native implementation of the crypto capability, backed by expo-crypto.
// This is the ONLY module in src/core allowed to import the native crypto
// dependency; everything else imports the capability from here
// (`@/core/platform/crypto`). In vitest the whole module is swapped for
// `./index.node.ts` via resolve.alias — the seam, not the native package,
// is the exchange point.
import {
  randomUUID as nativeRandomUUID,
  getRandomBytes as nativeGetRandomBytes,
} from "expo-crypto";

import type { PlatformCrypto } from "./types";

export const crypto: PlatformCrypto = {
  randomUUID: () => nativeRandomUUID(),
  getRandomBytes: (byteCount) => nativeGetRandomBytes(byteCount),
};

export const { randomUUID, getRandomBytes } = crypto;
