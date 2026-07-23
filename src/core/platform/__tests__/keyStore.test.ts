import { describe, it, expect, vi, beforeEach } from "vitest";

// This test targets the NATIVE adapter (expo-secure-store hardening), so it
// imports ../keyStore/index directly — the relative path bypasses the vitest
// alias that swaps @/core/platform/keyStore for the Node implementation.
// expo-secure-store itself can't load in Node, so it's mocked locally.
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

import * as SecureStore from "expo-secure-store";
import { saveKey } from "../keyStore/index";

describe("keyStore — SecureStore accessibility hardening (plan 006)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saveKey writes the key with keychainAccessible bound to this device", async () => {
    const setItemAsyncSpy = vi.spyOn(SecureStore, "setItemAsync");

    await saveKey("file-1", { id: "key-1", base64: "abc" });

    expect(setItemAsyncSpy).toHaveBeenCalledWith(
      expect.stringContaining("file-1"),
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: expect.anything(),
      }),
    );
  });
});
