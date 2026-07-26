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
});
