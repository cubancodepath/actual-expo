import { describe, it, expect } from "vitest";
import { buildHiddenSections } from "./useHiddenItems";
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

describe("buildHiddenSections", () => {
  it("is empty when nothing is hidden", () => {
    expect(buildHiddenSections([category({ id: "a", group: "g" })], [group({ id: "g" })])).toEqual(
      [],
    );
  });

  it("keeps a visible group only for its own hidden categories", () => {
    const sections = buildHiddenSections(
      [category({ id: "shown", group: "g" }), category({ id: "gone", group: "g", hidden: true })],
      [group({ id: "g", name: "Bills" })],
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].groupName).toBe("Bills");
    expect(sections[0].isGroupHidden).toBe(false);
    expect(sections[0].categories).toEqual([{ id: "gone", name: "gone" }]);
  });

  // Every category of a hidden group is listed, whatever its own flag says:
  // picking any of them is allowed, and unhideItems works out that the group has
  // to open and the rest get pinned.
  it("lists every category of a hidden group", () => {
    const sections = buildHiddenSections(
      [
        category({ id: "inherited", group: "doomed" }),
        category({ id: "both", group: "doomed", hidden: true }),
      ],
      [group({ id: "doomed", name: "Savings", hidden: true })],
    );

    expect(sections[0].isGroupHidden).toBe(true);
    expect(sections[0].categories).toEqual([
      { id: "inherited", name: "inherited" },
      { id: "both", name: "both" },
    ]);
  });

  // Otherwise an emptied hidden group would have no row to bring it back.
  it("keeps a hidden group with no categories at all", () => {
    const sections = buildHiddenSections([], [group({ id: "empty", hidden: true })]);

    expect(sections).toHaveLength(1);
    expect(sections[0].categories).toEqual([]);
  });

  it("orders income groups last", () => {
    const sections = buildHiddenSections(
      [],
      [
        group({ id: "inc", is_income: true, hidden: true }),
        group({ id: "exp", hidden: true, sort_order: 1 }),
      ],
    );

    expect(sections.map((s) => s.groupId)).toEqual(["exp", "inc"]);
  });
});
