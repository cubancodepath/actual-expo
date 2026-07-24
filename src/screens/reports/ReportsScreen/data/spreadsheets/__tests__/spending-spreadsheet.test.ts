// Spending: pure category-condition helpers + a real-DB integration run of the
// spreadsheet (makeQuery + cumulative math) against the AQL compiler / expo
// dialect. The integration test pins the compare/compareTo cumulative series.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import type { Category, CategoryGroup, SpendingEntity } from "@/core/types/models";
import { isSupportedCategoryCondition, filterCategoriesByConditions } from "../../budgetDataQuery";
import { resolveSpendingAverageRange } from "../../spendingAverageRange";
import { createSpendingSpreadsheet } from "../spending-spreadsheet";

describe("budgetDataQuery helpers", () => {
  const cats: Category[] = [
    {
      id: "food",
      name: "Food",
      is_income: false,
      group: "g1",
      sort_order: 1,
      hidden: false,
      goal_def: null,
      tombstone: false,
    },
    {
      id: "rent",
      name: "Rent",
      is_income: false,
      group: "g1",
      sort_order: 2,
      hidden: false,
      goal_def: null,
      tombstone: false,
    },
  ];
  const groups: CategoryGroup[] = [{ id: "g1", name: "Bills" } as CategoryGroup];

  it("recognizes supported category conditions", () => {
    expect(isSupportedCategoryCondition({ field: "category", op: "is", value: "food" })).toBe(true);
    expect(isSupportedCategoryCondition({ field: "category", op: "oneOf", value: ["food"] })).toBe(
      true,
    );
    expect(isSupportedCategoryCondition({ field: "notes", op: "is", value: "x" })).toBe(false);
    expect(isSupportedCategoryCondition({ field: "category", op: "gt", value: 1 })).toBe(false);
  });

  it("filters categories by an `is` condition", () => {
    const out = filterCategoriesByConditions(
      cats,
      groups,
      [{ field: "category", op: "is", value: "food" }],
      "and",
    );
    expect(out.map((c) => c.id)).toEqual(["food"]);
  });

  it("returns all categories when there are no category conditions", () => {
    expect(
      filterCategoriesByConditions(cats, groups, [{ field: "notes", op: "is", value: "x" }], "and"),
    ).toHaveLength(2);
  });
});

describe("resolveSpendingAverageRange", () => {
  it("resolves last-n-months to the month list before the compare month", () => {
    const r = resolveSpendingAverageRange({
      averageRange: { mode: "last-n-months", months: 3 },
      compare: "2024-04",
    });
    expect(r.startMonth).toBe("2024-01");
    expect(r.endMonth).toBe("2024-03");
    expect(r.months).toEqual(["2024-01", "2024-02", "2024-03"]);
  });
});

describe("createSpendingSpreadsheet (real DB)", () => {
  const categories: Category[] = [
    {
      id: "food",
      name: "Food",
      is_income: false,
      group: "g1",
      sort_order: 1,
      hidden: false,
      goal_def: null,
      tombstone: false,
    },
  ];
  const categoryGroups: CategoryGroup[] = [{ id: "g1", name: "Bills" } as CategoryGroup];

  beforeEach(async () => {
    await openTestDb();
    await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
      "acc1",
      "Checking",
      0,
      0,
    ]);
    await run("INSERT INTO category_groups (id, name, tombstone) VALUES (?,?,?)", [
      "g1",
      "Bills",
      0,
    ]);
    await run(
      "INSERT INTO categories (id, name, is_income, cat_group, tombstone) VALUES (?,?,?,?,?)",
      ["food", "Food", 0, "g1", 0],
    );
    await run("INSERT INTO category_mapping (id, transferId) VALUES (?,?)", ["food", "food"]);
    await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Store", 0]);
    await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

    const tx = (id: string, amount: number, date: number) =>
      run(
        "INSERT INTO transactions (id, acct, category, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, "acc1", "food", "p1", amount, date, 0, 0, 0],
      );
    // compare month 2024-02: -3000 (day 5) + -2000 (day 10) → cumulative -5000
    await tx("t1", -3000, 20240205);
    await tx("t2", -2000, 20240210);
    // compareTo month 2024-01: -1000 (day 5)
    await tx("t3", -1000, 20240105);
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("builds the daily cumulative series for compare vs compareTo", async () => {
    let captured: SpendingEntity | undefined;
    const runner = createSpendingSpreadsheet({
      compare: "2024-02",
      compareTo: "2024-01",
      categories,
      categoryGroups,
    });
    await runner((d) => {
      captured = d;
    });
    const data = captured!;

    expect(data.intervalData).toHaveLength(28);

    const day10 = data.intervalData.find((d) => d.day === "10")!;
    expect(day10.compare).toBe(-5000); // 2024-02 cumulative through the 10th

    const day05 = data.intervalData.find((d) => d.day === "05")!;
    expect(day05.compareTo).toBe(-1000); // 2024-01 cumulative through the 5th

    // Every debit in the queried range (default last-3-months average window).
    expect(data.totalDebts).toBe(-6000);
  });
});
