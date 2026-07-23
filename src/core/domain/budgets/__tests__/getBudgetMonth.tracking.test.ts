import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount } from "@/core/domain/accounts";
import { addTransaction } from "@/core/domain/transactions";
import { setArbitraryPref } from "@/core/domain/preferences";
import { setBudgetAmount, getBudgetMonth, computeToBudget } from "@/core/domain/budgets";
import { currentMonth } from "@/core/shared/months";

const day = (month: string) => Number(month.replace("-", "") + "15");

/**
 * getBudgetMonth on a tracking (report) budget: per-category values come from
 * the same aliased cells; the SUMMARY branches to total-saved / real-saved and
 * there is no To-Budget. Writers (setBudgetAmount) now target reflect_budgets,
 * so the read must reflect what was written.
 */
describe("getBudgetMonth — tracking budget", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("reads reflect_budgets amounts and exposes saved summaries, no To-Budget", async () => {
    await openTestDb();
    const incomeGroup = await createCategoryGroup({ name: "Income", is_income: true });
    const income = await createCategory({ name: "Pay", cat_group: incomeGroup, is_income: true });
    const expenses = await createCategoryGroup({ name: "Expenses" });
    const groceries = await createCategory({ name: "Groceries", cat_group: expenses });
    const acct = await createAccount({ name: "Checking" });

    // Select tracking BEFORE initSpreadsheet so getEngine() builds tracking cells.
    await setArbitraryPref("budgetType", "tracking");
    const { initSpreadsheet, ensureMonthRange } = await import("@/core/domain/spreadsheet/sync");
    await initSpreadsheet();
    const month = currentMonth();
    await ensureMonthRange(month);

    await addTransaction({ account: acct, date: day(month), amount: 10000, category: income });
    // In tracking budgets income is BUDGETED (expected income); total-saved is
    // budgeted-income − budgeted-expense.
    await setBudgetAmount(month, income, 10000); // → reflect_budgets
    await setBudgetAmount(month, groceries, 4000); // → reflect_budgets
    await addTransaction({ account: acct, date: day(month), amount: -1500, category: groceries });

    const bm = await getBudgetMonth(month);

    const cat = bm.groups
      .find((g) => g.id === expenses)!
      .categories.find((c) => c.id === groceries)!;
    expect(cat.budgeted).toBe(4000);
    expect(cat.spent).toBe(-1500);
    expect(cat.balance).toBe(2500); // budgeted + spent

    // Tracking summary: no To-Budget/buffer; saved = income − budgeted,
    // realSaved = income − spent.
    expect(bm.toBudget).toBe(0);
    expect(bm.buffered).toBe(0);
    expect(bm.income).toBe(10000);
    expect(bm.totalSaved).toBe(10000 - 4000);
    expect(bm.realSaved).toBe(10000 - 1500);
    expect(await computeToBudget(month)).toBe(0);
  });
});
