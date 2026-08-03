import { describe, expect, it } from "vitest";
import {
  cornersAt,
  flattenSections,
  hasDuplicateName,
  moveRow,
  reflowByGroupOrder,
  resolveCategoryDrop,
  resolveGroupDrop,
  toCategoryOrder,
  toGroupRows,
  withGroupPatched,
  type ReorderRow,
} from "../reorderModel";
import type { BudgetSection } from "@/screens/budget/hooks/useBudgetSections";

function category(id: string, name = id, is_income = false) {
  return { id, name, goal_def: null, is_income, hidden: false };
}

function section(id: string, categoryIds: string[], is_income = false): BudgetSection {
  return {
    id,
    name: `${id} group`,
    is_income,
    categories: categoryIds.map((c) => category(c, c, is_income)),
  };
}

/** Bills[food, rent] · Fun[games] · Income[salary] — the fixture for most cases. */
const SECTIONS: BudgetSection[] = [
  section("bills", ["food", "rent"]),
  section("fun", ["games"]),
  section("income", ["salary"], true),
];

/**
 * The drop resolution always reads an array the drag has already reordered, so
 * the tests do the same: move `from` → `to`, then resolve at `to`. That keeps the
 * index arithmetic honest — a test that hand-built the "after" array could agree
 * with a resolver that's wrong about what a drop even produces.
 */
function drop(rows: ReorderRow[], from: number, to: number) {
  return resolveCategoryDrop(moveRow(rows, from, to), to);
}

describe("flattenSections", () => {
  it("interleaves a header before each group's categories", () => {
    expect(flattenSections(SECTIONS).map((r) => r.key)).toEqual([
      "group:bills",
      "cat:food",
      "cat:rent",
      "group:fun",
      "cat:games",
      "group:income",
      "cat:salary",
    ]);
  });

  it("keeps an empty group's header, so it can still be dropped into", () => {
    const rows = flattenSections([section("empty", [])]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("header");
  });
});

describe("cornersAt", () => {
  const rows = flattenSections(SECTIONS);

  it("rounds the top of a group's first category and the bottom of its last", () => {
    expect(cornersAt(rows, 1)).toEqual({ isFirst: true, isLast: false });
    expect(cornersAt(rows, 2)).toEqual({ isFirst: false, isLast: true });
  });

  it("rounds both corners of an only child", () => {
    expect(cornersAt(rows, 4)).toEqual({ isFirst: true, isLast: true });
  });

  it("treats the end of the list as the end of a card", () => {
    expect(cornersAt(rows, 6)).toEqual({ isFirst: true, isLast: true });
  });
});

describe("resolveCategoryDrop", () => {
  const rows = flattenSections(SECTIONS);

  it("reorders within a group, inserting before the next category", () => {
    // rent (2) up to where food is (1) → [bills, rent, food, …]
    expect(drop(rows, 2, 1)).toEqual({
      ok: true,
      categoryId: "rent",
      name: "rent",
      groupId: "bills",
      targetId: "food",
      isCrossGroup: false,
    });
  });

  it("appends when the row lands last in its group", () => {
    // food (1) down past rent → last in bills, next row is the Fun header
    expect(drop(rows, 1, 2)).toEqual({
      ok: true,
      categoryId: "food",
      name: "food",
      groupId: "bills",
      targetId: null,
      isCrossGroup: false,
    });
  });

  it("moves across groups when the row lands under another header", () => {
    // food (1) → index 3, which puts it below the Fun header
    expect(drop(rows, 1, 3)).toEqual({
      ok: true,
      categoryId: "food",
      name: "food",
      groupId: "fun",
      targetId: "games",
      isCrossGroup: true,
    });
  });

  it("appends to the group when the row lands at the very end of the list", () => {
    const expenses = flattenSections(SECTIONS.slice(0, 2));
    expect(drop(expenses, 1, expenses.length - 1)).toEqual({
      ok: true,
      categoryId: "food",
      name: "food",
      groupId: "fun",
      targetId: null,
      isCrossGroup: true,
    });
  });

  it("lands in an empty group", () => {
    const rows2 = flattenSections([section("bills", ["food"]), section("empty", [])]);
    // food (1) → index 2, below the empty group's header
    expect(drop(rows2, 1, 2)).toMatchObject({
      ok: true,
      groupId: "empty",
      targetId: null,
      isCrossGroup: true,
    });
  });

  it("refuses a drop above the first header, where there is no group", () => {
    expect(drop(rows, 1, 0)).toEqual({ ok: false, reason: "invalid" });
  });

  it("refuses an expense category dropped into the income group", () => {
    expect(drop(rows, 1, 5)).toEqual({ ok: false, reason: "income-boundary" });
  });

  it("refuses an income category dropped into an expense group", () => {
    expect(drop(rows, 6, 1)).toEqual({ ok: false, reason: "income-boundary" });
  });

  it("refuses to resolve a header", () => {
    expect(resolveCategoryDrop(rows, 0)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("withGroupPatched", () => {
  it("re-homes the moved row so a second drag reads its new group", () => {
    const moved = moveRow(flattenSections(SECTIONS), 1, 3);
    const patched = withGroupPatched(moved, 3, "fun");
    expect(patched[3]).toMatchObject({ id: "food", groupId: "fun" });
    // Resolving again is now a within-group move, not another cross-group one.
    expect(resolveCategoryDrop(patched, 3)).toMatchObject({ isCrossGroup: false });
  });

  it("leaves the array alone when the group didn't change", () => {
    const rows = flattenSections(SECTIONS);
    expect(withGroupPatched(rows, 1, "bills")).toBe(rows);
  });
});

describe("hasDuplicateName", () => {
  const categories = [
    { id: "food", name: "Food", group: "bills" },
    { id: "groceries", name: "Groceries", group: "fun" },
  ];

  it("catches a namesake already in the destination group", () => {
    expect(hasDuplicateName(categories, "groceries", "fun", "food")).toBe(true);
  });

  it("ignores case, the way the insert path's UPPER(name) lookup does", () => {
    expect(hasDuplicateName(categories, "GROCERIES", "fun", "food")).toBe(true);
  });

  it("ignores the row being moved", () => {
    expect(hasDuplicateName(categories, "Food", "bills", "food")).toBe(false);
  });

  it("allows the same name in a different group", () => {
    expect(hasDuplicateName(categories, "Groceries", "bills", "food")).toBe(false);
  });
});

describe("toGroupRows", () => {
  it("leaves income out, since the budget pins it last regardless of sort order", () => {
    expect(toGroupRows(SECTIONS)).toEqual([
      { kind: "group", key: "group:bills", id: "bills", name: "bills group", categoryCount: 2 },
      { kind: "group", key: "group:fun", id: "fun", name: "fun group", categoryCount: 1 },
    ]);
  });

  it("keys a group the same collapsed as expanded, so its cell survives the swap", () => {
    const headers = flattenSections(SECTIONS).filter((r) => r.kind === "header");
    expect(toGroupRows(SECTIONS).map((r) => r.key)).toEqual(
      headers.filter((h) => !h.isIncome).map((h) => h.key),
    );
  });

  it("inserts before the next group, and appends at the end", () => {
    const rows = toGroupRows(SECTIONS);
    expect(resolveGroupDrop(moveRow(rows, 1, 0), 0)).toEqual({
      id: "fun",
      targetId: "bills",
    });
    expect(resolveGroupDrop(moveRow(rows, 0, 1), 1)).toEqual({
      id: "bills",
      targetId: null,
    });
  });

  it("resolves nothing for an index that isn't there", () => {
    expect(resolveGroupDrop(toGroupRows(SECTIONS), 9)).toBeNull();
  });
});

describe("reflowByGroupOrder", () => {
  const rows = flattenSections(SECTIONS);

  it("moves a group's categories with it", () => {
    expect(reflowByGroupOrder(rows, ["fun", "bills"]).map((r) => r.key)).toEqual([
      "group:fun",
      "cat:games",
      "group:bills",
      "cat:food",
      "cat:rent",
      "group:income",
      "cat:salary",
    ]);
  });

  it("keeps income last, since the order never mentions it", () => {
    const flowed = reflowByGroupOrder(rows, ["fun", "bills"]);
    expect(flowed[flowed.length - 2].key).toBe("group:income");
  });

  it("keeps a category order made before the groups moved", () => {
    // Swap food and rent inside Bills, then move Bills after Fun.
    const swapped = moveRow(rows, 2, 1);
    expect(reflowByGroupOrder(swapped, ["fun", "bills"]).map((r) => r.key)).toEqual([
      "group:fun",
      "cat:games",
      "group:bills",
      "cat:rent",
      "cat:food",
      "group:income",
      "cat:salary",
    ]);
  });

  it("is a no-op against the order it already has", () => {
    expect(reflowByGroupOrder(rows, ["bills", "fun"]).map((r) => r.key)).toEqual(
      rows.map((r) => r.key),
    );
  });

  it("carries an empty group across", () => {
    const withEmpty = flattenSections([section("bills", ["food"]), section("empty", [])]);
    expect(reflowByGroupOrder(withEmpty, ["empty", "bills"]).map((r) => r.key)).toEqual([
      "group:empty",
      "group:bills",
      "cat:food",
    ]);
  });
});

describe("toCategoryOrder", () => {
  it("reads the arrangement out of the rows", () => {
    expect(toCategoryOrder(toGroupRows(SECTIONS), flattenSections(SECTIONS))).toEqual({
      groups: ["bills", "fun"],
      categories: { bills: ["food", "rent"], fun: ["games"], income: ["salary"] },
    });
  });

  it("keeps the income group's own categories, though the group can't move", () => {
    const order = toCategoryOrder(toGroupRows(SECTIONS), flattenSections(SECTIONS));
    expect(order.groups).not.toContain("income");
    expect(order.categories.income).toEqual(["salary"]);
  });

  it("reports a category under the group it was dragged into", () => {
    // food (1) → index 3, which puts it below the Fun header.
    const moved = withGroupPatched(moveRow(flattenSections(SECTIONS), 1, 3), 3, "fun");
    const order = toCategoryOrder(toGroupRows(SECTIONS), moved);
    expect(order.categories).toMatchObject({ bills: ["rent"], fun: ["food", "games"] });
  });

  it("lists an empty group with no categories", () => {
    const sections = [section("empty", [])];
    expect(toCategoryOrder(toGroupRows(sections), flattenSections(sections))).toEqual({
      groups: ["empty"],
      categories: { empty: [] },
    });
  });
});
