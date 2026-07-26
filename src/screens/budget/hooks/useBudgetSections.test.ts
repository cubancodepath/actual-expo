import { describe, it, expect } from "vitest";
import { buildBudgetSections } from "./useBudgetSections";
import type { Category, CategoryGroup } from "@/core/types/models";

function group(over: Partial<CategoryGroup> & { id: string }): CategoryGroup {
  return {
    name: over.id,
    is_income: false,
    hidden: false,
    sort_order: 0,
    tombstone: false,
    ...over,
  } as CategoryGroup;
}

function category(over: Partial<Category> & { id: string; group: string }): Category {
  return {
    name: over.id,
    is_income: false,
    hidden: false,
    goal_def: null,
    sort_order: 0,
    tombstone: false,
    ...over,
  } as Category;
}

describe("buildBudgetSections", () => {
  it("orders income groups last, then by sort order", () => {
    const { sections } = buildBudgetSections(
      [],
      [
        group({ id: "income", is_income: true, sort_order: 0 }),
        group({ id: "second", sort_order: 2 }),
        group({ id: "first", sort_order: 1 }),
      ],
    );

    expect(sections.map((s) => s.id)).toEqual(["first", "second", "income"]);
  });

  it("leaves out an individually hidden category and counts it", () => {
    const { sections, hiddenCount } = buildBudgetSections(
      [category({ id: "visible", group: "g" }), category({ id: "gone", group: "g", hidden: true })],
      [group({ id: "g" })],
    );

    expect(sections[0].categories.map((c) => c.id)).toEqual(["visible"]);
    expect(hiddenCount).toBe(1);
  });

  /**
   * A hidden group takes its categories with it even though their own flag is
   * false — which is exactly why they can't be recovered one by one, and why
   * `HiddenCategoriesScreen` has to offer the group itself.
   */
  it("drops a hidden group entirely and counts all of its categories", () => {
    const { sections, hiddenCount } = buildBudgetSections(
      [
        category({ id: "a", group: "doomed" }),
        category({ id: "b", group: "doomed" }),
        category({ id: "c", group: "kept" }),
      ],
      [group({ id: "doomed", hidden: true }), group({ id: "kept" })],
    );

    expect(sections.map((s) => s.id)).toEqual(["kept"]);
    expect(hiddenCount).toBe(2);
  });

  it("does not double-count a hidden category inside a hidden group", () => {
    const { hiddenCount } = buildBudgetSections(
      [category({ id: "a", group: "doomed", hidden: true })],
      [group({ id: "doomed", hidden: true })],
    );

    expect(hiddenCount).toBe(1);
  });

  it("keeps an empty visible group, so it can still be added to", () => {
    const { sections } = buildBudgetSections([], [group({ id: "g" })]);

    expect(sections).toHaveLength(1);
    expect(sections[0].categories).toEqual([]);
  });

  it("returns nothing when there are no groups", () => {
    expect(buildBudgetSections([category({ id: "orphan", group: "g" })], [])).toEqual({
      sections: [],
      hiddenCount: 0,
    });
  });
});
