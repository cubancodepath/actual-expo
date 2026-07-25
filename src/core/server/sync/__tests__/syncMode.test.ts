import { describe, it, expect, afterEach } from "vitest";
import { setSyncingMode, checkSyncingMode } from "@/core/server/sync/syncMode";

describe("syncMode — checkSyncingMode/setSyncingMode (Phase 3.4)", () => {
  afterEach(() => {
    setSyncingMode("enabled");
  });

  it("defaults to enabled", () => {
    expect(checkSyncingMode("enabled")).toBe(true);
    expect(checkSyncingMode("disabled")).toBe(false);
    expect(checkSyncingMode("offline")).toBe(false);
    expect(checkSyncingMode("import")).toBe(false);
  });

  it("returns the previous mode from setSyncingMode", () => {
    const prev = setSyncingMode("offline");
    expect(prev).toBe("enabled");
  });

  it("offline counts as enabled but is also independently checkable", () => {
    setSyncingMode("offline");
    expect(checkSyncingMode("enabled")).toBe(true);
    expect(checkSyncingMode("offline")).toBe(true);
    expect(checkSyncingMode("disabled")).toBe(false);
  });

  it("import counts as disabled but is also independently checkable", () => {
    setSyncingMode("import");
    expect(checkSyncingMode("disabled")).toBe(true);
    expect(checkSyncingMode("import")).toBe(true);
    expect(checkSyncingMode("enabled")).toBe(false);
  });

  it("disabled is neither enabled nor offline nor import", () => {
    setSyncingMode("disabled");
    expect(checkSyncingMode("enabled")).toBe(false);
    expect(checkSyncingMode("offline")).toBe(false);
    expect(checkSyncingMode("import")).toBe(false);
    expect(checkSyncingMode("disabled")).toBe(true);
  });
});
