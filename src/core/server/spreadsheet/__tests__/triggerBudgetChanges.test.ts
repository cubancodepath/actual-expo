import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { createAccount, updateAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
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
    const catId = await createCategory({ name: "Groceries", groupId: groupId });
    const acctId = await createAccount({ name: "Checking" });
    await loadSpreadsheet();

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
    const catA = await createCategory({ name: "Groceries", groupId: groupId });
    const catB = await createCategory({ name: "Dining", groupId: groupId });
    const acctId = await createAccount({ name: "Checking" });
    await loadSpreadsheet();

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

describe("triggerBudgetChanges — creating a category is cheap", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("does not recompute other categories' sum-amount- cells", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const existing = await createCategory({ name: "Groceries", groupId });
    const acctId = await createAccount({ name: "Checking" });
    await loadSpreadsheet();

    const today = currentMonth();
    await addTransaction({
      account: acctId,
      date: dateIntFor(today),
      amount: -3000,
      category: existing,
    });

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(today);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(existing))).toBe(-3000);

    // Creating a category writes a self-referential category_mapping row. That
    // used to invalidate EVERY sum-amount- cell (one per category per month),
    // blocking the thread long enough to delay the "applied" event live queries
    // wait on. Only the new category's own cells may be touched.
    let recomputed = 0;
    const spy = ss.recomputeResolved.bind(ss);
    ss.recomputeResolved = (name: string) => {
      recomputed += 1;
      return spy(name);
    };

    await createCategory({ name: "Dining", groupId });

    expect(recomputed).toBe(0);
    // …and the untouched category keeps its value.
    expect(ss.getValue(sheet, envelopeBudget.catSpent(existing))).toBe(-3000);
  });
});

describe("triggerBudgetChanges — per-entity granularity (upstream parity)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("touches only the transaction's own category, not every category", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const target = await createCategory({ name: "Groceries", groupId });
    // Two more categories that must NOT be recomputed.
    await createCategory({ name: "Dining", groupId });
    await createCategory({ name: "Fuel", groupId });
    const acctId = await createAccount({ name: "Checking" });
    await loadSpreadsheet();

    const today = currentMonth();
    const ss = getSpreadsheet();
    const sheet = sheetForMonth(today);

    const touched: string[] = [];
    const spy = ss.recomputeResolved.bind(ss);
    ss.recomputeResolved = (name: string) => {
      touched.push(name);
      return spy(name);
    };

    await addTransaction({
      account: acctId,
      date: dateIntFor(today),
      amount: -3000,
      category: target,
    });

    // Upstream's handleTransactionChange resolves ONE cell: the transaction's
    // category in the transaction's month. The old prefix sweep hit every
    // category in every built month, which is what blocked the JS thread.
    const spendCells = touched.filter((n) => n.includes("sum-amount-"));
    expect(spendCells.every((n) => n.endsWith(`sum-amount-${target}`))).toBe(true);
    expect(ss.getValue(sheet, envelopeBudget.catSpent(target))).toBe(-3000);
  });
});
