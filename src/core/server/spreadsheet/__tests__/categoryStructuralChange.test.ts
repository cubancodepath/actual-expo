import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import {
  createCategoryGroup,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/core/server/budget";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { setBudgetAmount } from "@/core/server/budget/actions";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth, addMonths } from "@/core/shared/months";

function dateIntFor(month: string, day = "15"): number {
  return Number(month.replace("-", "") + day);
}

/**
 * Characterization: what adding, hiding and deleting a category must do to the
 * sheet. Pinned BEFORE the incremental handlers replace the full structural
 * rebuild, so the two can be compared — especially the carryover chain into the
 * following month, which is the thing a bad rebuild corrupts silently.
 */
describe("category structural changes — cells and carryover", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function setup() {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const existing = await createCategory({ name: "Groceries", groupId });
    const acctId = await createAccount({ name: "Checking" });
    await loadSpreadsheet();

    const month = currentMonth();
    await setBudgetAmount(month, existing, 10000);
    await addTransaction({
      account: acctId,
      date: dateIntFor(month),
      amount: -3000,
      category: existing,
    });
    return { groupId, existing, month };
  }

  it("gives a new category live cells and folds it into its group's totals", async () => {
    const { groupId, existing, month } = await setup();
    const ss = getSpreadsheet();
    const sheet = sheetForMonth(month);

    expect(ss.getValue(sheet, envelopeBudget.groupBudgeted(groupId))).toBe(10000);

    const added = await createCategory({ name: "Dining", groupId });
    await setBudgetAmount(month, added, 5000);

    // The new category has its own cells…
    expect(ss.getValue(sheet, envelopeBudget.catBudgeted(added))).toBe(5000);
    // …and the group total counts it.
    expect(ss.getValue(sheet, envelopeBudget.groupBudgeted(groupId))).toBe(15000);
    // The pre-existing category is untouched.
    expect(ss.getValue(sheet, envelopeBudget.catBudgeted(existing))).toBe(10000);
  });

  it("carries a new category's balance into the next month", async () => {
    const { groupId, month } = await setup();
    const ss = getSpreadsheet();
    const next = addMonths(month, 1);

    const added = await createCategory({ name: "Dining", groupId });
    await setBudgetAmount(month, added, 5000);

    // Nothing spent, so the whole budget rolls forward.
    expect(ss.getValue(sheetForMonth(month), envelopeBudget.catBalance(added))).toBe(5000);
    expect(ss.getValue(sheetForMonth(next), envelopeBudget.catBalance(added))).toBe(5000);
  });

  it("drops a deleted category out of its group's totals", async () => {
    const { groupId, existing, month } = await setup();
    const ss = getSpreadsheet();
    const sheet = sheetForMonth(month);

    const added = await createCategory({ name: "Dining", groupId });
    await setBudgetAmount(month, added, 5000);
    expect(ss.getValue(sheet, envelopeBudget.groupBudgeted(groupId))).toBe(15000);

    await deleteCategory(added);

    expect(ss.getValue(sheet, envelopeBudget.groupBudgeted(groupId))).toBe(10000);
    expect(ss.getValue(sheet, envelopeBudget.catBudgeted(existing))).toBe(10000);
  });

  it("keeps a hidden category in envelope group totals (upstream parity)", async () => {
    const { groupId, month } = await setup();
    const ss = getSpreadsheet();
    const sheet = sheetForMonth(month);

    const added = await createCategory({ name: "Dining", groupId });
    await setBudgetAmount(month, added, 5000);

    await updateCategory(added, { hidden: true });

    // Envelope has no `hidden` branch — only tracking hides from totals.
    expect(ss.getValue(sheet, envelopeBudget.groupBudgeted(groupId))).toBe(15000);
  });
});
