import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount, updateAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { initSpreadsheet } from "@/core/server/sheet";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth } from "@/core/shared/months";

function dateIntFor(month: string, day = "15"): number {
  return Number(month.replace("-", "") + day);
}

describe("triggerBudgetChanges — accounts/category_mapping invalidation (fix #11)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("recomputes sum-amount- cells when an account is toggled off-budget", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", cat_group: groupId });
    const acctId = await createAccount({ name: "Checking" });
    await initSpreadsheet();

    const today = currentMonth();
    await addTransaction({
      account: acctId,
      date: dateIntFor(today),
      amount: -5000,
      category: catId,
    });

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(today);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(catId))).toBe(-5000);

    await updateAccount(acctId, { offbudget: true });

    // The catSpent SQL cell filters a.offbudget = 0 — once the account
    // flips, its transactions must drop out of the sum on next recompute.
    expect(ss.getValue(sheet, envelopeBudget.catSpent(catId))).toBe(0);
  });

  it("recomputes sum-amount- cells for both categories when a category is remapped (merge)", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catA = await createCategory({ name: "Groceries", cat_group: groupId });
    const catB = await createCategory({ name: "Dining", cat_group: groupId });
    const acctId = await createAccount({ name: "Checking" });
    await initSpreadsheet();

    const today = currentMonth();
    await addTransaction({
      account: acctId,
      date: dateIntFor(today),
      amount: -3000,
      category: catA,
    });

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(today);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(catA))).toBe(-3000);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(catB))).toBe(0);

    // Simulate merging catA into catB: category_mapping.transferId now
    // resolves catA's transactions to catB (mirrors deleteCategory(catA, catB)).
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "category_mapping",
        row: catA,
        column: "transferId",
        value: catB,
      },
    ]);

    expect(ss.getValue(sheet, envelopeBudget.catSpent(catA))).toBe(0);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(catB))).toBe(-3000);
  });
});
