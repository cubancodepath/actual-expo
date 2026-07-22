import { describe, it, expect, vi, beforeEach } from "vitest";
import * as SecureStore from "expo-secure-store";
import { saveKey } from "@/core/platform/keyStore";

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
