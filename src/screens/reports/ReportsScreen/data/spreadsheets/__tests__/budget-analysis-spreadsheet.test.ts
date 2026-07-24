// Budget analysis: the category-selection predicate. The month-by-month cell
// reads go through the reactive budget spreadsheet (envelope engine), which is
// covered by the budget spreadsheet tests and verified on device; here we pin
// the base-category rule and rely on the shared, already-tested
// filterCategoriesByConditions for the condition narrowing.
import { describe, it, expect } from "vitest";
import type { Category } from "@/core/types/models";
import { isBaseCategory } from "../budget-analysis-spreadsheet";

const cat = (over: Partial<Category>): Category => ({
  id: "c",
  name: "C",
  is_income: false,
  group: "g",
  sort_order: 1,
  hidden: false,
  goal_def: null,
  tombstone: false,
  ...over,
});

describe("isBaseCategory", () => {
  it("includes visible expense categories", () => {
    expect(isBaseCategory(cat({}), false)).toBe(true);
  });

  it("excludes income categories", () => {
    expect(isBaseCategory(cat({ is_income: true }), false)).toBe(false);
  });

  it("excludes hidden categories unless showHiddenCategories", () => {
    expect(isBaseCategory(cat({ hidden: true }), false)).toBe(false);
    expect(isBaseCategory(cat({ hidden: true }), true)).toBe(true);
  });
});
