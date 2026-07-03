import { describe, it, expect } from "vitest";
import { safeNumber } from "@/lib/number";

describe("safeNumber (fix #13 — restored integer invariant)", () => {
  it("returns the value unchanged for a safe integer", () => {
    expect(safeNumber(12345)).toBe(12345);
    expect(safeNumber(-500)).toBe(-500);
    expect(safeNumber(0)).toBe(0);
  });

  it("throws for a non-integer value instead of silently coercing it", () => {
    expect(() => safeNumber(0.1 + 0.2)).toThrow(/not an integer/);
    expect(() => safeNumber(12.5)).toThrow(/not an integer/);
  });

  it("throws for a value outside the safe arithmetic range", () => {
    expect(() => safeNumber(2 ** 52)).toThrow(/can't safely perform arithmetic/);
    expect(() => safeNumber(-(2 ** 52))).toThrow(/can't safely perform arithmetic/);
  });
});
