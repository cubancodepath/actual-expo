import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/post", () => ({
  post: vi.fn(),
}));

vi.mock("@/core/server/encryption", () => ({
  hasKey: vi.fn(),
}));

import { checkKey } from "@/core/server/sync/cloudStorage";
import { post } from "@/core/post";
import * as encryption from "@/core/server/encryption";

describe("checkKey — proactive key-mismatch detection (fix #7 / Phase 4.2)", () => {
  beforeEach(() => {
    vi.mocked(post).mockReset();
    vi.mocked(encryption.hasKey).mockReset();
  });

  it("is valid when the server's key id matches and the key is loaded locally", async () => {
    vi.mocked(post).mockResolvedValue({ id: "key-1" });
    vi.mocked(encryption.hasKey).mockReturnValue(true);

    const result = await checkKey({
      serverUrl: "https://s",
      token: "t",
      cloudFileId: "f",
      encryptKeyId: "key-1",
    });

    expect(result).toEqual({ valid: true });
  });

  it("is a key-mismatch when the server's key id differs (peer rotated the key)", async () => {
    vi.mocked(post).mockResolvedValue({ id: "key-2" });
    vi.mocked(encryption.hasKey).mockReturnValue(true);

    const result = await checkKey({
      serverUrl: "https://s",
      token: "t",
      cloudFileId: "f",
      encryptKeyId: "key-1",
    });

    expect(result).toEqual({ valid: false, error: { reason: "key-mismatch" } });
  });

  it("is a key-mismatch when the id matches but the key isn't loaded locally", async () => {
    vi.mocked(post).mockResolvedValue({ id: "key-1" });
    vi.mocked(encryption.hasKey).mockReturnValue(false);

    const result = await checkKey({
      serverUrl: "https://s",
      token: "t",
      cloudFileId: "f",
      encryptKeyId: "key-1",
    });

    expect(result).toEqual({ valid: false, error: { reason: "key-mismatch" } });
  });

  it("is valid for an unencrypted file (both ids null/undefined)", async () => {
    vi.mocked(post).mockResolvedValue({ id: null });

    const result = await checkKey({
      serverUrl: "https://s",
      token: "t",
      cloudFileId: "f",
      encryptKeyId: undefined,
    });

    expect(result).toEqual({ valid: true });
  });

  it("reports a network error when the request fails", async () => {
    vi.mocked(post).mockRejectedValue(new Error("network down"));

    const result = await checkKey({
      serverUrl: "https://s",
      token: "t",
      cloudFileId: "f",
      encryptKeyId: "key-1",
    });

    expect(result).toEqual({ valid: false, error: { reason: "network" } });
  });
});
