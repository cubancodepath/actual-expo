import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { createAccount } from "@/core/server/accounts";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setArbitraryPref } from "@/core/server/preferences";
import { setBudgetAmount } from "@/core/server/budget/actions";
import { generateForecast } from "../index";

let counter = 0;
async function mkTxn(fields: Record<string, string | number | null>): Promise<string> {
  const id = `txn-${++counter}`;
  const full = { id, tombstone: 0, isParent: 0, isChild: 0, cleared: 0, ...fields };
  await sendMessages(
    Object.entries(full).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions" as const,
      row: id,
      column,
      value,
    })),
  );
  return id;
}

describe("generateForecast — tracking-budget source", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("throws on a non-tracking file", async () => {
    await openTestDb();
    await expect(generateForecast({ source: "tracking-budget" })).rejects.toThrow(
      /Tracking Budget/,
    );
  });

  it("projects monthly from on-budget balances + budgeted income − expenses", async () => {
    await openTestDb();
    const incomeGroup = await createCategoryGroup({ name: "Income", isIncome: true });
    const income = await createCategory({ name: "Pay", groupId: incomeGroup, isIncome: true });
    const expenses = await createCategoryGroup({ name: "Expenses" });
    const rent = await createCategory({ name: "Rent", groupId: expenses });
    const acct = await createAccount({ name: "Checking", offbudget: false });
    await mkTxn({ acct, amount: 50000, date: 20981201 }); // seed balance

    await setArbitraryPref("budgetType", "tracking");
    const { loadSpreadsheet } = await import("@/core/server/sheet");
    await loadSpreadsheet();

    // Budget expected income/expense for the forecast month (→ reflect_budgets).
    await setBudgetAmount("2099-01", income, 10000);
    await setBudgetAmount("2099-01", rent, 4000);

    const result = await generateForecast({
      source: "tracking-budget",
      startDate: "2099-01-01",
      endDate: "2099-01-31",
    });

    expect(result.dataPoints).toHaveLength(1);
    expect(result.dataPoints[0]).toMatchObject({
      date: "2099-01-31",
      accountId: "tracking-budget",
      balance: 56000, // 50000 seed + (10000 − 4000)
    });
  });
});
