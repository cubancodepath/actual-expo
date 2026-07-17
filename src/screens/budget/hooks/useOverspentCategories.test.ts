import { describe, expect, it } from "vitest";
import { makeCategoryCellMatcher } from "./useOverspentCategories";

describe("makeCategoryCellMatcher", () => {
  const matches = makeCategoryCellMatcher("budget2026-03");

  it("matches this sheet's leftover (catBalance) cells", () => {
    expect(matches("budget2026-03!leftover-cat-abc-123")).toBe(true);
  });

  it("matches this sheet's carryover cells", () => {
    expect(matches("budget2026-03!carryover-cat-abc-123")).toBe(true);
  });

  it("does not match unrelated cell kinds on the same sheet", () => {
    expect(matches("budget2026-03!sum-amount-cat-abc-123")).toBe(false);
    expect(matches("budget2026-03!budget-cat-abc-123")).toBe(false);
    expect(matches("budget2026-03!to-budget")).toBe(false);
  });

  it("does not match the same cell kind on a different month's sheet", () => {
    expect(matches("budget2026-04!leftover-cat-abc-123")).toBe(false);
  });

  it("does not false-match a sheet name that is a prefix of another (2026-1 vs 2026-10)", () => {
    const jan = makeCategoryCellMatcher("budget2026-1");
    expect(jan("budget2026-10!leftover-cat-abc-123")).toBe(false);
  });
});
