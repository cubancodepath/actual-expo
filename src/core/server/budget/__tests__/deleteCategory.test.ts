import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { createAccount } from "@/core/server/accounts";
import { addTransaction } from "@/core/server/transactions";
import { Timestamp } from "@/core/crdt";
import { currentMonth } from "@/core/shared/months";
import {
  createCategoryGroup,
  createCategory,
  deleteCategory,
  isCategoryTransferRequired,
} from "../index";
import { setBudget } from "../actions";

/**
 * Characterization tests for the category_mapping write flow (plan: rules/mappings
 * parity). Pin CURRENT behavior of deleteCategory(id, transferId) so the
 * migrateIds wiring has a stable foundation. Must pass on the unmodified branch.
 */
describe("deleteCategory — category_mapping writes", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function transferIdOf(id: string): Promise<string | null> {
    const row = await first<{ transferId: string }>(
      "SELECT transferId FROM category_mapping WHERE id = ?",
      [id],
    );
    return row?.transferId ?? null;
  }

  it("creates a self-mapping on category creation", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });
    expect(await transferIdOf(c)).toBe(c);
  });

  it("maps a deleted category to its transfer target and tombstones it", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: g });
    const deleted = await createCategory({ name: "Deleted", groupId: g });

    await deleteCategory(deleted, target);

    expect(await transferIdOf(deleted)).toBe(target);
    const row = await first<{ tombstone: number }>(
      "SELECT tombstone FROM categories WHERE id = ?",
      [deleted],
    );
    expect(row?.tombstone).toBe(1);
  });

  it("flattens a chain: A -> deleted becomes A -> target", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: g });
    const deleted = await createCategory({ name: "Deleted", groupId: g });
    const a = await createCategory({ name: "A", groupId: g });

    // Pre-existing redirect A -> deleted (as if A was deleted into `deleted`).
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "category_mapping",
        row: a,
        column: "transferId",
        value: deleted,
      },
    ]);
    expect(await transferIdOf(a)).toBe(deleted);

    await deleteCategory(deleted, target);

    expect(await transferIdOf(deleted)).toBe(target);
    expect(await transferIdOf(a)).toBe(target);
  });
});

/**
 * The guard the delete flows ask before deciding whether to demand a transfer
 * target. It has to resolve through `category_mapping`, because that is where
 * redirection lives — nothing ever rewrites `transactions.category`.
 */
describe("isCategoryTransferRequired", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function spend(categoryId: string): Promise<void> {
    const acct = await createAccount({ name: "Checking" });
    await addTransaction({
      account: acct,
      date: Number(currentMonth().replace("-", "") + "01"),
      amount: -1000,
      category: categoryId,
    });
  }

  it("is false for a category nothing points at", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });

    expect(await isCategoryTransferRequired(c)).toBe(false);
  });

  it("is true for a category holding transactions", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });
    await spend(c);

    expect(await isCategoryTransferRequired(c)).toBe(true);
  });

  // The case a plain `transactions.category = ?` count misses: the transaction
  // still names the deleted category, and only the mapping says it now belongs
  // to the target. Deleting the target without a destination would strand it a
  // second time.
  it("is true for a category that inherited transactions from a deleted one", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: g });
    const deleted = await createCategory({ name: "Deleted", groupId: g });
    await spend(deleted);

    await deleteCategory(deleted, target);

    expect(await isCategoryTransferRequired(target)).toBe(true);
  });

  // Money parked in a category is as good a reason to demand a destination as
  // transactions are — without this it would be deleted away silently.
  it("is true for a category holding budgeted money and no transactions", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });
    await setBudget("2026-03", c, 5000);

    expect(await isCategoryTransferRequired(c)).toBe(true);
  });

  it("is false when the budgeted amount is zero", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });
    await setBudget("2026-03", c, 0);

    expect(await isCategoryTransferRequired(c)).toBe(false);
  });
});

describe("deleteCategory — the money follows the transactions", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("folds the deleted category's budget onto the target", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: g });
    const doomed = await createCategory({ name: "Doomed", groupId: g });
    await setBudget("2026-03", target, 1000);
    await setBudget("2026-03", doomed, 400);

    await deleteCategory(doomed, target);

    const row = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [202603, target],
    );
    expect(row?.amount).toBe(1400);
  });

  it("refuses to move money across the income/expense line", async () => {
    await openTestDb();
    const expenses = await createCategoryGroup({ name: "Expenses" });
    const income = await createCategoryGroup({ name: "Income", isIncome: true });
    const doomed = await createCategory({ name: "Doomed", groupId: expenses });
    const salary = await createCategory({ name: "Salary", groupId: income, isIncome: true });

    await expect(deleteCategory(doomed, salary)).rejects.toThrow(/income and expense categories/i);
  });

  it("throws when the transfer target doesn't exist", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const doomed = await createCategory({ name: "Doomed", groupId: g });

    await expect(deleteCategory(doomed, "nope")).rejects.toThrow(/not found/i);
  });
});
