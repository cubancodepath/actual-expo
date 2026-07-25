import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { monthToInt, currentMonth } from "@/core/shared/months";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { setBudgetAmount, setCategoryCarryover } from "@/core/server/budget/actions";
import { setNote } from "@/core/server/notes";
import { storeNoteCleanups } from "../cleanup-template-notes";
import { computeCleanup, cleanupTemplate, type CleanupPlan } from "../cleanup-template";

/**
 * Evaluator tests — upstream has no unit test for processCleanup, so this is
 * new coverage of the redistribution algorithm. to-budget = income - Σbudgeted
 * (single month, no carry-in). Categories are created BEFORE the spreadsheet is
 * initialized so their sum-amount cells exist (mirrors getBudgetMonth.test).
 */
function opFor(plan: CleanupPlan, id: string): number | undefined {
  return plan.ops.find((o) => o.categoryId === id)?.amount;
}
const day = (month: string) => Number(month.replace("-", "") + "15");

/** Opens a DB and returns builders; call cat() for every category, then start(). */
async function seed() {
  await openTestDb();
  const incomeGroup = await createCategoryGroup({ name: "Income", isIncome: true });
  const income = await createCategory({ name: "Pay", groupId: incomeGroup, isIncome: true });
  const expenses = await createCategoryGroup({ name: "Expenses" });
  const acct = await createAccount({ name: "Checking" });
  const month = currentMonth();

  const cat = (name: string) => createCategory({ name, groupId: expenses });
  async function start() {
    const { loadSpreadsheet, ensureMonthRange } = await import("@/core/server/sheet");
    await loadSpreadsheet();
    await ensureMonthRange(month);
    await addTransaction({ account: acct, date: day(month), amount: 10000, category: income });
  }
  const spend = (category: string, amount: number) =>
    addTransaction({ account: acct, date: day(month), amount: -amount, category });

  return { month, cat, start, spend };
}

describe("computeCleanup — evaluator", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("global source returns its leftover and sets a goal", async () => {
    const { month, cat, start, spend } = await seed();
    const src = await cat("Src");
    await start();
    await setBudgetAmount(month, src, 5000);
    await spend(src, 2000);
    await setNote(src, "#cleanup source");

    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    // leftover was 3000 → budget drops to 2000, 3000 returned to To-Budget.
    expect(opFor(plan, src)).toBe(2000);
    expect(plan.goals).toEqual([{ categoryId: src, goal: 2000, longGoal: false }]);
    expect(plan.summary).toContain("1 source(s) and funded 0 sinking fund(s)");
  });

  it("auto-funds an overspent category, excluding income and carryover categories", async () => {
    const { month, cat, start, spend } = await seed();
    const over = await cat("Over");
    const carry = await cat("Carry");
    const normal = await cat("Normal");
    await start();
    for (const c of [over, carry, normal]) await setBudgetAmount(month, c, 1000);
    await spend(over, 3000);
    await spend(carry, 3000);
    await spend(normal, 500);
    await setCategoryCarryover(month, carry, true);

    // No cleanup notes: step C still auto-funds overspend from To-Budget.
    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    expect(opFor(plan, over)).toBe(3000); // 1000 budgeted + 2000 shortfall
    expect(opFor(plan, carry)).toBeUndefined(); // carryover → skipped
    expect(opFor(plan, normal)).toBeUndefined(); // not overspent
    expect(plan.summary).toBe("All categories were up to date.");
  });

  it("group: pulls source leftover, covers overspend first, then fills sinks", async () => {
    const { month, cat, start, spend } = await seed();
    const src = await cat("GSrc");
    const over = await cat("GOver");
    const sink = await cat("GSink");
    await start();
    await setBudgetAmount(month, src, 5000);
    await setBudgetAmount(month, over, 1000);
    await spend(src, 1000);
    await spend(over, 2000);
    await setNote(src, "#cleanup Trip source");
    await setNote(over, "#cleanup Trip");
    await setNote(sink, "#cleanup Trip sink");

    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    expect(opFor(plan, src)).toBe(1000); // 5000 - 4000 leftover pulled out
    expect(opFor(plan, over)).toBe(2000); // 1000 + 1000 shortfall covered
    expect(opFor(plan, sink)).toBe(3000); // remaining 3000 of the 4000 pool
  });

  it("group with no sink or overspend member: warns and pulls nothing", async () => {
    const { month, cat, start, spend } = await seed();
    const src = await cat("Solo");
    await start();
    await setBudgetAmount(month, src, 5000);
    await spend(src, 1000);
    await setNote(src, "#cleanup Solo source");

    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    expect(plan.ops).toEqual([]);
    expect(plan.warnings).toContain('Cleanup group "Solo" has no matching sink categories.');
  });

  it("weighted global sinks split the available funds by weight", async () => {
    const { month, cat, start, spend } = await seed();
    const src = await cat("Src");
    const sinkA = await cat("SinkA");
    const sinkB = await cat("SinkB");
    await start();
    await setBudgetAmount(month, src, 5000);
    await spend(src, 1000);
    await setNote(src, "#cleanup source");
    await setNote(sinkA, "#cleanup sink 1");
    await setNote(sinkB, "#cleanup sink 3");

    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    // Source returns 4000 → To-Budget 5000 + 4000 = 9000, split 1:3.
    expect(opFor(plan, src)).toBe(1000);
    expect(opFor(plan, sinkA)).toBe(2250);
    expect(opFor(plan, sinkB)).toBe(6750);
    expect(plan.summary).toContain("1 source(s) and funded 2 sinking fund(s)");
  });

  it("reports up to date when nothing is overspent and no cleanup notes exist", async () => {
    const { month, cat, start, spend } = await seed();
    const c = await cat("Fine");
    await start();
    await setBudgetAmount(month, c, 1000);
    await spend(c, 500);

    await storeNoteCleanups();
    const plan = await computeCleanup(month);

    expect(plan.ops).toEqual([]);
    expect(plan.summary).toBe("All categories were up to date.");
  });

  it("cleanupTemplate persists the plan to the budget table", async () => {
    const { month, cat, start, spend } = await seed();
    const src = await cat("Src");
    const sink = await cat("Sink");
    await start();
    await setBudgetAmount(month, src, 5000);
    await spend(src, 1000);
    await setNote(src, "#cleanup source");
    await setNote(sink, "#cleanup sink");

    const summary = await cleanupTemplate(month);
    expect(summary).toContain("1 source(s) and funded 1 sinking fund(s)");

    const srcRow = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [monthToInt(month), src],
    );
    const sinkRow = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [monthToInt(month), sink],
    );
    expect(srcRow?.amount).toBe(1000); // returned its 4000 leftover
    expect(sinkRow?.amount).toBe(9000); // received all of To-Budget (5000 + 4000)
  });
});
