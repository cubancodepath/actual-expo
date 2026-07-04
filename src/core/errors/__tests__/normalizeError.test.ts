import { describe, expect, it } from "vitest";
import { ActualError } from "../ActualError";
import { normalizeError } from "../normalizeError";
import { PostError } from "../PostError";
import { SyncError } from "../SyncError";

describe("normalizeError", () => {
  it("passes an ActualError through unchanged", () => {
    const original = new ActualError("sync/clock-drift");
    expect(normalizeError(original)).toBe(original);
  });

  describe("legacy PostError", () => {
    it.each([
      ["network-failure", "network/offline"],
      ["invalid-password", "auth/invalid-password"],
      ["unauthorized", "auth/token-expired"],
      ["token-expired", "auth/token-expired"],
      ["parse-json", "http/parse-error"],
    ] as const)("maps type %s to code %s", (type, expectedCode) => {
      const error = normalizeError(new PostError(type));
      expect(error).toBeInstanceOf(ActualError);
      expect(error.code).toBe(expectedCode);
    });

    it("maps unrecognized server-provided types to http/server-error with serverReason", () => {
      const error = normalizeError(new PostError("some-weird-server-string"));
      expect(error.code).toBe("http/server-error");
      expect(error.context?.serverReason).toBe("some-weird-server-string");
    });
  });

  describe("legacy SyncError", () => {
    it("maps isMissingKey to sync/key-missing, preserving keyRotated", () => {
      const error = normalizeError(
        new SyncError("decrypt-failure", { isMissingKey: true, keyRotated: true }),
      );
      expect(error.code).toBe("sync/key-missing");
      expect(error.context?.keyRotated).toBe(true);
    });

    it.each([
      ["clock-drift", "sync/clock-drift"],
      ["out-of-sync", "sync/out-of-sync"],
      ["invalid-schema", "sync/invalid-schema"],
      ["encrypt-failure", "sync/encrypt-failure"],
      ["decrypt-failure", "sync/decrypt-failure"],
    ] as const)("maps type %s to code %s", (type, expectedCode) => {
      expect(normalizeError(new SyncError(type)).code).toBe(expectedCode);
    });
  });

  describe("foreign errors", () => {
    it("sniffs network-flavored messages", () => {
      expect(normalizeError(new Error("Network request failed")).code).toBe("network/offline");
      expect(normalizeError(new TypeError("fetch failed")).code).toBe("network/offline");
      expect(normalizeError(new Error("timeout exceeded")).code).toBe("network/offline");
    });

    it("sniffs database-unavailable messages", () => {
      expect(normalizeError(new Error("closed resource")).code).toBe("db/unavailable");
      expect(normalizeError(new Error("Database not initialized")).code).toBe("db/unavailable");
    });

    it("falls back to unknown/unexpected for anything else", () => {
      expect(normalizeError(new Error("bespoke failure")).code).toBe("unknown/unexpected");
      expect(normalizeError("just a string").code).toBe("unknown/unexpected");
      expect(normalizeError(null).code).toBe("unknown/unexpected");
    });
  });
});
