import { describe, expect, it } from "vitest";
import { ActualError } from "../ActualError";
import { normalizeError } from "../normalizeError";

describe("normalizeError", () => {
  it("passes an ActualError through unchanged", () => {
    const original = new ActualError("sync/clock-drift");
    expect(normalizeError(original)).toBe(original);
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
