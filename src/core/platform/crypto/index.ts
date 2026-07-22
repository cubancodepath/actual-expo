// RN implementation of the crypto capability, backed by expo-crypto. This is
// the ONLY module in src/core allowed to import the native crypto dependency;
// everything else in core imports from here (`@/core/platform/crypto`).
//
// (In vitest this resolves to src/__mocks__/expo-crypto.ts via the config
// alias, so the platform boundary is transparently mocked in Node tests.)
import {
  randomUUID as nativeRandomUUID,
  getRandomBytes as nativeGetRandomBytes,
} from "expo-crypto";

import type * as T from "./index-types";

export const randomUUID: T.RandomUUID = () => nativeRandomUUID();

export const getRandomBytes: T.GetRandomBytes = (byteCount) => nativeGetRandomBytes(byteCount);
