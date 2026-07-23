import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/domain/transactions";
import { computeGoalAllocations, updateGoalIndicator } from "./apply";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { currentMonth } from "@/core/shared/months";
import { first } from "@/core/db";

async function setCategoryNote(categoryId: string, note: string): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "notes",
      row: categoryId,
      column: "note",
      value: note,
    },
  ]);
}

/** Seeds income + an initialized spreadsheet so computeToBudget() has funds to allocate. */
async function seedAvailableFunds(amountCents: number): Promise<void> {
  const { initSpreadsheet } = await import("@/core/domain/spreadsheet/sync");
  const incomeGroup = await createCategoryGroup({ name: "Income", is_income: true });
  const incomeCat = await createCategory({
    name: "Paycheck",
    cat_group: incomeGroup,
    is_income: true,
  });
  const acct = await createAccount({ name: "Checking" });
  await initSpreadsheet();
  const month = currentMonth();
  await addTransaction({
    account: acct,
    date: Number(month.replace("-", "") + "01"),
    amount: amountCents,
    category: incomeCat,
  });
}

describe("goal application picks up legacy #template notes when goal_def is empty (fix #12)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("computeGoalAllocations budgets a category whose only template lives in notes", async () => {
    await openTestDb();
    await seedAvailableFunds(100000);
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    await setCategoryNote(cat, "Just a reminder\n#template 500");

    const month = currentMonth();
    const result = await computeGoalAllocations(month, true);

    expect(result.applied).toBe(1);
    const alloc = result.allocations.get(cat);
    expect(alloc?.amount).toBe(50000); // $500 -> cents
  });

  it("ignores a category with only ordinary notes (no #template/#goal)", async () => {
    await openTestDb();
    await seedAvailableFunds(100000);
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    await setCategoryNote(cat, "Just a plain reminder note");

    const result = await computeGoalAllocations(currentMonth(), true);
    expect(result.applied).toBe(0);
  });

  it("updateGoalIndicator writes a goal indicator sourced from legacy notes", async () => {
    await openTestDb();
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    await setCategoryNote(cat, "#goal 1000");

    await updateGoalIndicator(currentMonth(), cat);

    const row = await first<{ goal: number }>("SELECT goal FROM zero_budgets WHERE category = ?", [
      cat,
    ]);
    expect(row?.goal).toBe(100000); // $1000 -> cents
  });

  it("prefers goal_def JSON over notes when both are present", async () => {
    await openTestDb();
    await seedAvailableFunds(100000);
    const { updateCategory } = await import("@/core/domain/categories");
    const group = await createCategoryGroup({ name: "Bills" });
    const cat = await createCategory({ name: "Rent", cat_group: group });
    await setCategoryNote(cat, "#template 999");
    await updateCategory(cat, {
      goal_def: JSON.stringify([
        { type: "simple", monthly: 42, priority: 0, directive: "template" },
      ]),
    });

    const result = await computeGoalAllocations(currentMonth(), true);
    expect(result.allocations.get(cat)?.amount).toBe(4200); // $42 -> cents
  });
});
