import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { monthToInt } from "@/lib/date";
import { setBudget, setBudgetGoal, budgetTable } from "../index";

/**
 * The type-aware budget writer picks zero_budgets (envelope) vs reflect_budgets
 * (tracking) from the `budgetType` preference — mirror of loot-core's
 * getBudgetTable()/setBudget/setGoal. Used by the #cleanup evaluator.
 */
async function setBudgetType(type: "envelope" | "tracking"): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "preferences",
      row: "budgetType",
      column: "value",
      value: type,
    },
  ]);
}

async function amountIn(table: string, month: string, cat: string): Promise<number | undefined> {
  const rows = await runQuery<{ amount: number }>(
    `SELECT amount FROM ${table} WHERE month = ? AND category = ?`,
    [monthToInt(month), cat],
  );
  return rows[0]?.amount;
}

describe("type-aware budget writer", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("defaults to zero_budgets (envelope)", async () => {
    await openTestDb();
    expect(await budgetTable()).toBe("zero_budgets");

    await setBudget("2026-07", "cat1", 5000);
    expect(await amountIn("zero_budgets", "2026-07", "cat1")).toBe(5000);
    expect(await amountIn("reflect_budgets", "2026-07", "cat1")).toBeUndefined();
  });

  it("writes reflect_budgets when budgetType is tracking", async () => {
    await openTestDb();
    await setBudgetType("tracking");
    expect(await budgetTable()).toBe("reflect_budgets");

    await setBudget("2026-07", "cat1", 5000);
    await setBudgetGoal("2026-07", "cat1", 4000, false);

    expect(await amountIn("reflect_budgets", "2026-07", "cat1")).toBe(5000);
    expect(await amountIn("zero_budgets", "2026-07", "cat1")).toBeUndefined();

    const goalRow = await runQuery<{ goal: number; long_goal: number }>(
      "SELECT goal, long_goal FROM reflect_budgets WHERE month = ? AND category = ?",
      [monthToInt("2026-07"), "cat1"],
    );
    expect(goalRow[0]).toEqual({ goal: 4000, long_goal: 0 });
  });
});
