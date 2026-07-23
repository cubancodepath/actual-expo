import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { runQuery } from "@/core/db";
import { monthToInt } from "@/core/shared/months";
import { setArbitraryPref } from "@/core/domain/preferences";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import {
  setBudgetAmount,
  setCategoryCarryover,
  transferBetweenCategories,
  transferMultipleCategories,
} from "../index";
import { setGoalResult } from "@/core/domain/goals/persist";

/**
 * The budget writers route through budgetTable(): envelope → zero_budgets,
 * tracking → reflect_budgets. These pin that a tracking file's edits land in
 * reflect_budgets (and never in zero_budgets), and vice-versa. hold/resetHold/
 * transferAvailable stay envelope-only and are NOT covered here.
 */
async function amount(table: string, month: string, cat: string): Promise<number | undefined> {
  const rows = await runQuery<{ amount: number }>(
    `SELECT amount FROM ${table} WHERE month = ? AND category = ?`,
    [monthToInt(month), cat],
  );
  return rows[0]?.amount;
}
async function carry(table: string, month: string, cat: string): Promise<number | undefined> {
  const rows = await runQuery<{ carryover: number }>(
    `SELECT carryover FROM ${table} WHERE month = ? AND category = ?`,
    [monthToInt(month), cat],
  );
  return rows[0]?.carryover;
}

const M = "2026-07";

describe("type-aware budget writers", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function cats() {
    const g = await createCategoryGroup({ name: "Expenses" });
    const a = await createCategory({ name: "A", cat_group: g });
    const b = await createCategory({ name: "B", cat_group: g });
    return { a, b };
  }

  it("envelope (default): writes zero_budgets, not reflect_budgets", async () => {
    await openTestDb();
    const { a } = await cats();
    await setBudgetAmount(M, a, 5000);
    expect(await amount("zero_budgets", M, a)).toBe(5000);
    expect(await amount("reflect_budgets", M, a)).toBeUndefined();
  });

  it("tracking: setBudgetAmount + setCategoryCarryover + setGoalResult write reflect_budgets", async () => {
    await openTestDb();
    await setArbitraryPref("budgetType", "tracking");
    const { a } = await cats();

    await setBudgetAmount(M, a, 5000);
    await setCategoryCarryover(M, a, true);
    await setGoalResult(M, a, 4000, false);

    expect(await amount("reflect_budgets", M, a)).toBe(5000);
    expect(await carry("reflect_budgets", M, a)).toBe(1);
    expect(await amount("zero_budgets", M, a)).toBeUndefined();

    const goal = await runQuery<{ goal: number; long_goal: number }>(
      "SELECT goal, long_goal FROM reflect_budgets WHERE month = ? AND category = ?",
      [monthToInt(M), a],
    );
    expect(goal[0]).toEqual({ goal: 4000, long_goal: 0 });
  });

  it("tracking: transferBetweenCategories reads and writes reflect_budgets", async () => {
    await openTestDb();
    await setArbitraryPref("budgetType", "tracking");
    const { a, b } = await cats();
    await setBudgetAmount(M, a, 5000);

    await transferBetweenCategories(M, a, b, 1000);

    expect(await amount("reflect_budgets", M, a)).toBe(4000);
    expect(await amount("reflect_budgets", M, b)).toBe(1000);
    expect(await amount("zero_budgets", M, a)).toBeUndefined();
  });

  it("tracking: transferMultipleCategories accumulates in reflect_budgets", async () => {
    await openTestDb();
    await setArbitraryPref("budgetType", "tracking");
    const { a, b } = await cats();
    await setBudgetAmount(M, a, 3000);
    await setBudgetAmount(M, b, 3000);

    // Both sources give 1000 each to a fresh target.
    const g = await createCategoryGroup({ name: "More" });
    const target = await createCategory({ name: "T", cat_group: g });
    await transferMultipleCategories(
      M,
      target,
      [
        { categoryId: a, amountCents: 1000 },
        { categoryId: b, amountCents: 1000 },
      ],
      "to",
    );

    expect(await amount("reflect_budgets", M, a)).toBe(2000);
    expect(await amount("reflect_budgets", M, b)).toBe(2000);
    expect(await amount("reflect_budgets", M, target)).toBe(2000);
  });
});
