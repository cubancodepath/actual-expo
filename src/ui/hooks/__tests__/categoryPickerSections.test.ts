import { describe, it, expect } from "vitest";
import { buildCategoryPickerSections } from "../useCategoryPickerSections";
import type { Category, CategoryGroup } from "@/core/types/models";

function group(id: string, over: Partial<CategoryGroup> = {}): CategoryGroup {
  return {
    id,
    name: id,
    is_income: false,
    hidden: false,
    tombstone: false,
    sort_order: 0,
    ...over,
  } as CategoryGroup;
}

function category(id: string, groupId: string, over: Partial<Category> = {}): Category {
  return {
    id,
    name: id,
    group: groupId,
    is_income: false,
    hidden: false,
    tombstone: false,
    sort_order: 0,
    goal_def: null,
    ...over,
  } as Category;
}

const GROUPS = [group("bills"), group("income", { is_income: true, sort_order: 1 })];
const CATEGORIES = [
  category("rent", "bills"),
  category("food", "bills", { sort_order: 1 }),
  category("salary", "income", { is_income: true }),
];

const items = (sections: ReturnType<typeof buildCategoryPickerSections>) =>
  sections.flatMap((s) => s.items);

describe("buildCategoryPickerSections", () => {
  it("groups and orders, income last", () => {
    const sections = buildCategoryPickerSections(GROUPS, CATEGORIES);
    expect(sections.map((s) => s.group.id)).toEqual(["bills", "income"]);
    expect(sections[0].items.map((i) => i.id)).toEqual(["rent", "food"]);
  });

  describe("balances that haven't resolved", () => {
    it("leaves the balance undefined rather than inventing a zero", () => {
      // The bug this guards: `?? 0` made every row render a convincing $0.00
      // for as long as the balances took to arrive.
      const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, { balances: undefined });
      expect(items(sections).every((i) => i.balance === undefined)).toBe(true);
    });

    it("does not filter on a balance it doesn't have yet", () => {
      const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, {
        requirePositiveBalance: true,
        balances: undefined,
      });
      // Filtering here would empty the picker and then repopulate it.
      expect(items(sections)).toHaveLength(3);
    });
  });

  describe("balances resolved", () => {
    const balances = new Map([
      ["rent", 500],
      ["food", 0],
      ["salary", -100],
    ]);

    it("carries the balance through, zero included", () => {
      const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, { balances });
      expect(items(sections).map((i) => i.balance)).toEqual([500, 0, -100]);
    });

    it("keeps only positive balances when asked", () => {
      const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, {
        requirePositiveBalance: true,
        balances,
      });
      expect(items(sections).map((i) => i.id)).toEqual(["rent"]);
    });

    it("treats a category the map never mentions as having nothing to give", () => {
      const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, {
        requirePositiveBalance: true,
        balances: new Map([["rent", 500]]),
      });
      expect(items(sections).map((i) => i.id)).toEqual(["rent"]);
    });
  });

  it("still filters by search and exclusions", () => {
    const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, { q: "re" });
    expect(items(sections).map((i) => i.id)).toEqual(["rent"]);

    const excluded = buildCategoryPickerSections(GROUPS, CATEGORIES, {
      excludeIds: new Set(["rent"]),
    });
    expect(items(excluded).map((i) => i.id)).toEqual(["food", "salary"]);
  });

  it("drops income entirely when asked", () => {
    const sections = buildCategoryPickerSections(GROUPS, CATEGORIES, { excludeIncome: true });
    expect(sections.map((s) => s.group.id)).toEqual(["bills"]);
  });
});
