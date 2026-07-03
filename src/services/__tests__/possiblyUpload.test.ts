import { describe, it, expect } from "vitest";
import { shouldReupload, UPLOAD_FREQUENCY_IN_DAYS } from "@/services/budgetfiles";

describe("shouldReupload — periodic re-upload threshold (fix #6 / Phase 4.1)", () => {
  it("uploads immediately when never uploaded before", () => {
    expect(shouldReupload(undefined)).toBe(true);
  });

  it("does not re-upload before the frequency threshold", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const lastUploaded = new Date("2026-01-05T00:00:00Z").toISOString(); // 5 days ago
    expect(shouldReupload(lastUploaded, now)).toBe(false);
  });

  it("re-uploads exactly at the threshold", () => {
    const lastUploaded = new Date("2026-01-01T00:00:00Z").toISOString();
    const atThreshold = new Date("2026-01-01T00:00:00Z");
    atThreshold.setDate(atThreshold.getDate() + UPLOAD_FREQUENCY_IN_DAYS);
    expect(shouldReupload(lastUploaded, atThreshold)).toBe(true);
  });

  it("re-uploads well past the threshold", () => {
    const lastUploaded = new Date("2026-01-01T00:00:00Z").toISOString();
    const now = new Date("2026-02-01T00:00:00Z");
    expect(shouldReupload(lastUploaded, now)).toBe(true);
  });

  it("UPLOAD_FREQUENCY_IN_DAYS is 7 (matches upstream)", () => {
    expect(UPLOAD_FREQUENCY_IN_DAYS).toBe(7);
  });
});
