import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory, updateCategory } from "@/core/domain/categories";
import { setGoalResult } from "@/core/domain/goals/persist";
import { initSpreadsheet } from "@/core/server/sheet";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth } from "@/core/shared/months";

describe("goal cells — catGoal / catLongGoal (chip funding colour)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("falls back to the goal_def template when zero_budgets has no goal yet", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", cat_group: groupId });
    // #template 100 → monthly goal of $100.00, budgeted-based (longGoal false).
    await updateCategory(catId, {
      goal_def: JSON.stringify([{ type: "simple", monthly: 100, limit: null }]),
    });
    await initSpreadsheet();

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(ss.getValue(sheet, envelopeBudget.catGoal(catId))).toBe(10000);
    expect(ss.getValue(sheet, envelopeBudget.catLongGoal(catId))).toBe(false);
  });

  it("reflects zero_budgets.goal / long_goal once persisted and the trigger runs", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Savings", cat_group: groupId });
    await initSpreadsheet();

    const month = currentMonth();
    const sheet = sheetForMonth(month);
    const ss = getSpreadsheet();
    // No goal_def and no row → 0 / false.
    expect(ss.getValue(sheet, envelopeBudget.catGoal(catId))).toBe(0);

    // Persist a balance-based goal (applyGoals writes these columns).
    await setGoalResult(month, catId, 50000, true);

    expect(ss.getValue(sheet, envelopeBudget.catGoal(catId))).toBe(50000);
    expect(ss.getValue(sheet, envelopeBudget.catLongGoal(catId))).toBe(true);
  });
});
