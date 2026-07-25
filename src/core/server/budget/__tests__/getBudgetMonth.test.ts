import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import {
  setBudgetAmount,
  setCategoryCarryover,
  holdForNextMonth,
  getBudgetMonth,
  computeToBudget,
} from "@/core/server/budget/actions";
import { monthToInt } from "@/core/shared/months";
import { currentMonth, addMonths } from "@/core/shared/months";

function dateIntFor(month: string, day = "15"): number {
  return Number(month.replace("-", "") + day);
}

/**
 * getBudgetMonth() / computeToBudget() now read the spreadsheet cells
 * directly (fix #14) instead of an independent SQL reimplementation
 * (deleted toBudget.ts). This fixture — carryover on/off, overspending,
 * and a manual hold — was cross-checked against the old dual
 * implementation before it was removed; both agreed on every value below.
 */
describe("getBudgetMonth / computeToBudget — spreadsheet-backed (fix #14)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("computes toBudget, buffered, and per-category carry-forward across months", async () => {
    await openTestDb();

    const incomeGroup = await createCategoryGroup({ name: "Income", isIncome: true });
    const incomeCat = await createCategory({
      name: "Paycheck",
      groupId: incomeGroup,
      isIncome: true,
    });
    const expenseGroup = await createCategoryGroup({ name: "Expenses" });
    const catA = await createCategory({ name: "Groceries", groupId: expenseGroup });
    const catB = await createCategory({ name: "Dining", groupId: expenseGroup });
    const acctId = await createAccount({ name: "Checking" });

    const { loadSpreadsheet, ensureMonthRange } = await import("@/core/server/sheet");
    await loadSpreadsheet();

    const m0 = addMonths(currentMonth(), -2);
    const m1 = addMonths(currentMonth(), -1);
    const m2 = currentMonth();
    await ensureMonthRange(m0);

    await addTransaction({
      account: acctId,
      date: dateIntFor(m0),
      amount: 10000,
      category: incomeCat,
    });
    await setBudgetAmount(m0, catA, 5000);
    await addTransaction({ account: acctId, date: dateIntFor(m0), amount: -2000, category: catA });
    await setCategoryCarryover(m0, catA, true);
    await setBudgetAmount(m0, catB, 3000);
    await addTransaction({ account: acctId, date: dateIntFor(m0), amount: -5000, category: catB });

    await addTransaction({
      account: acctId,
      date: dateIntFor(m1),
      amount: 8000,
      category: incomeCat,
    });
    await setBudgetAmount(m1, catA, 0);
    await setBudgetAmount(m1, catB, 1000);
    const beforeHold = await computeToBudget(m1);
    await holdForNextMonth(m1, 1500, beforeHold);

    await addTransaction({
      account: acctId,
      date: dateIntFor(m2),
      amount: 4000,
      category: incomeCat,
    });
    await setBudgetAmount(m2, catA, 1000);

    // ── M0 ──
    const budgetM0 = await getBudgetMonth(m0);
    expect(budgetM0.toBudget).toBe(2000);
    expect(budgetM0.buffered).toBe(0);
    const catAinM0 = budgetM0.groups
      .find((g) => g.id === expenseGroup)!
      .categories.find((c) => c.id === catA)!;
    const catBinM0 = budgetM0.groups
      .find((g) => g.id === expenseGroup)!
      .categories.find((c) => c.id === catB)!;
    expect(catAinM0).toMatchObject({
      budgeted: 5000,
      spent: -2000,
      balance: 3000,
      carryIn: 0,
      carryover: true,
    });
    expect(catBinM0).toMatchObject({
      budgeted: 3000,
      spent: -5000,
      balance: -2000,
      carryIn: 0,
      carryover: false,
    });

    // ── M1 (after hold) ──
    expect(beforeHold).toBe(7000);
    const budgetM1 = await getBudgetMonth(m1);
    expect(budgetM1.toBudget).toBe(5500);
    expect(budgetM1.buffered).toBe(1500);
    const catAinM1 = budgetM1.groups
      .find((g) => g.id === expenseGroup)!
      .categories.find((c) => c.id === catA)!;
    const catBinM1 = budgetM1.groups
      .find((g) => g.id === expenseGroup)!
      .categories.find((c) => c.id === catB)!;
    // catA's balance carries forward in full (carryover was ON for M0).
    expect(catAinM1).toMatchObject({ budgeted: 0, spent: 0, balance: 3000, carryIn: 3000 });
    // catB's overspend was NOT carried (carryover OFF) — resets to 0 carry-in.
    expect(catBinM1).toMatchObject({ budgeted: 1000, spent: 0, balance: 1000, carryIn: 0 });

    // ── M2 ──
    const budgetM2 = await getBudgetMonth(m2);
    expect(budgetM2.toBudget).toBe(10000);
    expect(budgetM2.buffered).toBe(0);
    const catAinM2 = budgetM2.groups
      .find((g) => g.id === expenseGroup)!
      .categories.find((c) => c.id === catA)!;
    expect(catAinM2).toMatchObject({ budgeted: 1000, spent: 0, balance: 4000, carryIn: 3000 });

    // Income/summary fields
    expect(budgetM0.income).toBe(10000);
    expect(budgetM1.income).toBe(8000);
    expect(budgetM2.income).toBe(4000);
  });

  it("computeToBudget matches getBudgetMonth().toBudget", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Expenses" });
    await createCategory({ name: "Groceries", groupId: group });

    const { loadSpreadsheet } = await import("@/core/server/sheet");
    await loadSpreadsheet();

    const month = currentMonth();
    const [full, direct] = await Promise.all([getBudgetMonth(month), computeToBudget(month)]);
    expect(direct).toBe(full.toBudget);
  });

  it("works for a month far outside the initial horizon (lazily extends the range)", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    const { loadSpreadsheet } = await import("@/core/server/sheet");
    await loadSpreadsheet();

    const farMonth = addMonths(currentMonth(), 9);
    const budget = await getBudgetMonth(farMonth);
    expect(budget.month).toBe(farMonth);
    expect(typeof budget.toBudget).toBe("number");
    expect(monthToInt(farMonth)).toBeGreaterThan(0);
  });
});
