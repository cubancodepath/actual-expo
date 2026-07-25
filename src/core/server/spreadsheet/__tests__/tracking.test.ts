import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { Spreadsheet } from "@/core/server/spreadsheet/spreadsheet";
import { createBudgetCells, createAllBudgetCells } from "@/core/server/budget/tracking";
import { sheetForMonth, trackingBudget } from "@/core/server/spreadsheet/bindings";
import { getCategories, getCategoryGroups } from "@/core/server/budget";
import { currentMonth, addMonths, monthToInt } from "@/core/shared/months";

function dateIntFor(month: string, day = "15"): number {
  return Number(month.replace("-", "") + day);
}

async function setReflectBudget(
  month: string,
  categoryId: string,
  amount: number,
  carryover = false,
): Promise<void> {
  const id = `${monthToInt(month)}-${categoryId}`;
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "reflect_budgets",
      row: id,
      column: "month",
      value: monthToInt(month),
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "reflect_budgets",
      row: id,
      column: "category",
      value: categoryId,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "reflect_budgets",
      row: id,
      column: "amount",
      value: amount,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "reflect_budgets",
      row: id,
      column: "carryover",
      value: carryover ? 1 : 0,
    },
  ]);
}

describe("tracking.ts — report budget formulas (fix #9)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("computes catBalance for an expense category: budgeted + spent (+ carry-in if flagged)", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Expenses" });
    const cat = await createCategory({ name: "Groceries", groupId: group });
    const acct = await createAccount({ name: "Checking" });

    const ss = new Spreadsheet();
    const month = currentMonth();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    await addTransaction({ account: acct, date: dateIntFor(month), amount: -2000, category: cat });
    await setReflectBudget(month, cat, 5000);
    ss.startTransaction();
    await createBudgetCells(ss, month, cats, groups);
    ss.endTransaction();

    const sheet = sheetForMonth(month);
    expect(ss.getValue(sheet, trackingBudget.catBudgeted(cat))).toBe(5000);
    expect(ss.getValue(sheet, trackingBudget.catSpent(cat))).toBe(-2000);
    expect(ss.getValue(sheet, trackingBudget.catBalance(cat))).toBe(3000); // 5000 - 2000
  });

  it("carries forward the previous month's balance only when carryover is flagged", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Expenses" });
    const cat = await createCategory({ name: "Groceries", groupId: group });
    const acct = await createAccount({ name: "Checking" });

    const m0 = addMonths(currentMonth(), -1);
    const m1 = currentMonth();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    const ss = new Spreadsheet();
    await setReflectBudget(m0, cat, 5000, true); // budget 5000, carryover ON
    await addTransaction({ account: acct, date: dateIntFor(m0), amount: -2000, category: cat });
    ss.startTransaction();
    await createBudgetCells(ss, m0, cats, groups);
    ss.endTransaction();
    // m0 balance = 5000 - 2000 = 3000

    await setReflectBudget(m1, cat, 0);
    ss.startTransaction();
    await createBudgetCells(ss, m1, cats, groups);
    ss.endTransaction();

    const sheetM1 = sheetForMonth(m1);
    expect(ss.getValue(sheetM1, trackingBudget.catBalance(cat))).toBe(3000); // 0 + 0 + 3000 carry-in
  });

  it("computes spent-with-carryover: clamps to spent when carryover is off", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Expenses" });
    const cat = await createCategory({ name: "Groceries", groupId: group });
    const acct = await createAccount({ name: "Checking" });
    const month = currentMonth();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    const ss = new Spreadsheet();
    await addTransaction({ account: acct, date: dateIntFor(month), amount: -2000, category: cat });
    await setReflectBudget(month, cat, 5000, false);
    ss.startTransaction();
    await createBudgetCells(ss, month, cats, groups);
    ss.endTransaction();

    const sheet = sheetForMonth(month);
    expect(ss.getValue(sheet, trackingBudget.spentWithCarryover(cat))).toBe(-2000);
  });

  it("computes income leftover as budgeted - received (subtracted, unlike expense)", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Income", isIncome: true });
    const cat = await createCategory({ name: "Paycheck", groupId: group, isIncome: true });
    const acct = await createAccount({ name: "Checking" });
    const month = currentMonth();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    const ss = new Spreadsheet();
    await addTransaction({ account: acct, date: dateIntFor(month), amount: 10000, category: cat });
    ss.startTransaction();
    await createBudgetCells(ss, month, cats, groups);
    ss.endTransaction();

    const sheet = sheetForMonth(month);
    // budgeted defaults to 0 (no reflect_budgets row) - received(10000) + 0 = -10000
    expect(ss.getValue(sheet, trackingBudget.catBalance(cat))).toBe(-10000);
  });

  it("computes total-saved and real-saved summary cells", async () => {
    await openTestDb();
    const incomeGroup = await createCategoryGroup({ name: "Income", isIncome: true });
    const incomeCat = await createCategory({
      name: "Paycheck",
      groupId: incomeGroup,
      isIncome: true,
    });
    const expenseGroup = await createCategoryGroup({ name: "Expenses" });
    const expenseCat = await createCategory({ name: "Groceries", groupId: expenseGroup });
    const acct = await createAccount({ name: "Checking" });
    const month = currentMonth();

    const ss = new Spreadsheet();
    await addTransaction({
      account: acct,
      date: dateIntFor(month),
      amount: 10000,
      category: incomeCat,
    });
    await addTransaction({
      account: acct,
      date: dateIntFor(month),
      amount: -4000,
      category: expenseCat,
    });
    await setReflectBudget(month, expenseCat, 5000);
    await createAllBudgetCells(ss);

    const sheet = sheetForMonth(month);
    // totalBudgetIncome = income group's budgeted (0, income not budgeted) = 0
    expect(ss.getValue(sheet, trackingBudget.totalBudgetIncome)).toBe(0);
    // totalBudgeted (expense groups) = 5000
    expect(ss.getValue(sheet, trackingBudget.totalBudgeted)).toBe(5000);
    // totalSaved = totalBudgetIncome - totalBudgeted = 0 - 5000 = -5000
    expect(ss.getValue(sheet, trackingBudget.totalSaved)).toBe(-5000);
    // totalIncome = 10000, totalSpent = -4000 -> realSaved = 10000 - (-(-4000)) = 10000-4000=6000
    expect(ss.getValue(sheet, trackingBudget.totalIncome)).toBe(10000);
    expect(ss.getValue(sheet, trackingBudget.totalSpent)).toBe(-4000);
    expect(ss.getValue(sheet, trackingBudget.realSaved)).toBe(6000);
  });

  it("excludes hidden categories from group/summary sums", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Expenses" });
    const visibleCat = await createCategory({ name: "Groceries", groupId: group });
    const hiddenCat = await createCategory({ name: "Misc", groupId: group });
    const { updateCategory } = await import("@/core/server/budget");
    await updateCategory(hiddenCat, { hidden: true });
    const acct = await createAccount({ name: "Checking" });
    const month = currentMonth();
    const [cats, groups] = await Promise.all([getCategories(), getCategoryGroups()]);

    const ss = new Spreadsheet();
    await addTransaction({
      account: acct,
      date: dateIntFor(month),
      amount: -1000,
      category: visibleCat,
    });
    await addTransaction({
      account: acct,
      date: dateIntFor(month),
      amount: -9000,
      category: hiddenCat,
    });
    ss.startTransaction();
    await createBudgetCells(ss, month, cats, groups);
    ss.endTransaction();

    const sheet = sheetForMonth(month);
    // group-sum-amount only includes non-hidden categories
    expect(ss.getValue(sheet, trackingBudget.groupSpent(group))).toBe(-1000);
  });
});
