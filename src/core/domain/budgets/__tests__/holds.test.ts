import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { first } from "@/core/db";
import {
  setBudgetAmount,
  setCategoryCarryover,
  holdForNextMonth,
  resetHold,
  resetIncomeCarryover,
  computeToBudget,
} from "@/core/domain/budgets";
import { monthToInt, currentMonth } from "@/core/shared/months";

/**
 * Characterization tests for holdForNextMonth / resetHold /
 * setCategoryCarryover (plan 005). Setup pattern (DB init, category/account
 * creation) copied from getBudgetMonth.test.ts.
 */

function dateIntFor(month: string, day = "15"): number {
  return Number(month.replace("-", "") + day);
}

async function getBuffered(month: string): Promise<number> {
  const row = await first<{ buffered: number }>(
    "SELECT buffered FROM zero_budget_months WHERE id = ?",
    [month],
  );
  return row?.buffered ?? 0;
}

/** Reads the carryover flag straight off the zero_budgets row this function
 * writes to (rather than via the spreadsheet's catCarryover cell, which is
 * how the UI reads it in useOverspentCategories.ts) — this pins what
 * setCategoryCarryover itself writes, independent of the spreadsheet layer. */
async function getCarryoverFlag(month: string, categoryId: string): Promise<boolean> {
  const monthInt = monthToInt(month);
  const row = await first<{ carryover: number }>(
    "SELECT carryover FROM zero_budgets WHERE month = ? AND category = ?",
    [monthInt, categoryId],
  );
  return row?.carryover === 1;
}

/** Sets up an expense category plus enough income that computeToBudget()
 * returns a positive value — holdForNextMonth() no-ops when
 * currentToBudget <= 0 and no hold already exists. */
async function setupWithIncome() {
  const incomeGroup = await createCategoryGroup({ name: "Income", is_income: true });
  const incomeCat = await createCategory({
    name: "Paycheck",
    cat_group: incomeGroup,
    is_income: true,
  });
  const expenseGroup = await createCategoryGroup({ name: "Expenses" });
  const catA = await createCategory({ name: "A", cat_group: expenseGroup });
  const acctId = await createAccount({ name: "Checking" });
  const { initSpreadsheet } = await import("@/core/server/sheet");
  await initSpreadsheet();
  const month = currentMonth();
  await addTransaction({
    account: acctId,
    date: dateIntFor(month),
    amount: 10000,
    category: incomeCat,
  });
  return { catA, incomeCat, incomeGroup, month };
}

describe("budgets/index — holdForNextMonth / resetHold / setCategoryCarryover characterization", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("holdForNextMonth(month, amount, currentToBudget) sets the month's buffered amount", async () => {
    await openTestDb();
    const { month } = await setupWithIncome();
    const toBudget = await computeToBudget(month);
    expect(toBudget).toBeGreaterThan(0);

    const newBuffered = await holdForNextMonth(month, 1500, toBudget);
    expect(newBuffered).toBe(1500);
    expect(await getBuffered(month)).toBe(1500);
  });

  it("holdForNextMonth treats amount as a delta and clamps to the available to-budget", async () => {
    await openTestDb();
    const { month } = await setupWithIncome();

    // First hold from an empty buffer: delta 1500, plenty available → 1500.
    const t0 = await computeToBudget(month);
    expect(await holdForNextMonth(month, 1500, t0)).toBe(1500);

    // Second hold: to-budget now excludes the held 1500. A delta larger than
    // what's left clamps to the remaining to-budget (parity with loot-core's
    // calcBufferedAmount), never exceeding total available money.
    const t1 = await computeToBudget(month);
    expect(t1).toBe(t0 - 1500);
    const capped = await holdForNextMonth(month, 999999, t1);
    expect(capped).toBe(t0);
    expect(await getBuffered(month)).toBe(t0);
  });

  it("holdForNextMonth no-ops (returns null) when to-budget is not positive", async () => {
    await openTestDb();
    const { month } = await setupWithIncome();
    const t0 = await computeToBudget(month);
    await holdForNextMonth(month, t0, t0); // hold everything → to-budget 0
    expect(await getBuffered(month)).toBe(t0);

    const result = await holdForNextMonth(month, 500, 0);
    expect(result).toBeNull();
    expect(await getBuffered(month)).toBe(t0); // unchanged
  });

  it("resetIncomeCarryover(month) clears the flag on every income category for that month", async () => {
    await openTestDb();
    const { incomeCat, incomeGroup, month } = await setupWithIncome();
    const incomeCatB = await createCategory({
      name: "Bonus",
      cat_group: incomeGroup,
      is_income: true,
    });

    await setCategoryCarryover(month, incomeCat, true);
    await setCategoryCarryover(month, incomeCatB, true);
    expect(await getCarryoverFlag(month, incomeCat)).toBe(true);
    expect(await getCarryoverFlag(month, incomeCatB)).toBe(true);

    await resetIncomeCarryover(month);
    expect(await getCarryoverFlag(month, incomeCat)).toBe(false);
    expect(await getCarryoverFlag(month, incomeCatB)).toBe(false);
  });

  it("resetHold(month) clears the buffered amount back to 0", async () => {
    await openTestDb();
    const { month } = await setupWithIncome();
    const toBudget = await computeToBudget(month);
    await holdForNextMonth(month, 1500, toBudget);
    expect(await getBuffered(month)).toBe(1500);

    await resetHold(month);
    expect(await getBuffered(month)).toBe(0);
  });

  it("setCategoryCarryover(month, categoryId, flag) sets a readable carryover flag for the month", async () => {
    await openTestDb();
    const { catA, month } = await setupWithIncome();
    await setBudgetAmount(month, catA, 1000);
    expect(await getCarryoverFlag(month, catA)).toBe(false);

    await setCategoryCarryover(month, catA, true);
    expect(await getCarryoverFlag(month, catA)).toBe(true);

    await setCategoryCarryover(month, catA, false);
    expect(await getCarryoverFlag(month, catA)).toBe(false);
  });
});
