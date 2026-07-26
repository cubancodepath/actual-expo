import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { createCategoryGroup, createCategory, deleteCategoryGroup } from "../index";
import { setBudget } from "../actions";

/**
 * Deleting a group takes every category with it, so the transfer target has to
 * reach all of them. Nothing here touches `transactions.category` — redirection
 * lives in `category_mapping`, joined at read time — so "the transactions
 * survive" means "every category ends up mapped to the target".
 */
describe("deleteCategoryGroup", () => {
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

  async function tombstoneOf(table: string, id: string): Promise<number | undefined> {
    const row = await first<{ tombstone: number }>(`SELECT tombstone FROM ${table} WHERE id = ?`, [
      id,
    ]);
    return row?.tombstone;
  }

  it("maps every category in the group to the target", async () => {
    await openTestDb();
    const keep = await createCategoryGroup({ name: "Keep" });
    const target = await createCategory({ name: "Target", groupId: keep });

    const doomed = await createCategoryGroup({ name: "Doomed" });
    const a = await createCategory({ name: "A", groupId: doomed });
    const b = await createCategory({ name: "B", groupId: doomed });

    await deleteCategoryGroup(doomed, target);

    expect(await transferIdOf(a)).toBe(target);
    expect(await transferIdOf(b)).toBe(target);
    expect(await tombstoneOf("categories", a)).toBe(1);
    expect(await tombstoneOf("categories", b)).toBe(1);
    expect(await tombstoneOf("category_groups", doomed)).toBe(1);
  });

  it("flattens chains that pointed into the group", async () => {
    await openTestDb();
    const keep = await createCategoryGroup({ name: "Keep" });
    const target = await createCategory({ name: "Target", groupId: keep });
    // Deleted earlier, into a category that is about to disappear with its group.
    const older = await createCategory({ name: "Older", groupId: keep });

    const doomed = await createCategoryGroup({ name: "Doomed" });
    const a = await createCategory({ name: "A", groupId: doomed });

    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "category_mapping",
        row: older,
        column: "transferId",
        value: a,
      },
    ]);
    expect(await transferIdOf(older)).toBe(a);

    await deleteCategoryGroup(doomed, target);

    expect(await transferIdOf(a)).toBe(target);
    // Without this the older redirect would still resolve to a dead category.
    expect(await transferIdOf(older)).toBe(target);
  });

  // Pinned as the broken state it is: nothing here rewrites the mappings, so
  // every category is left resolving to itself while tombstoned. This is why
  // the UI must never call the bare form for a group holding transactions —
  // see useDeleteCategoryGroup.
  it("without a target, leaves each category mapped to itself and dead", async () => {
    await openTestDb();
    const doomed = await createCategoryGroup({ name: "Doomed" });
    const a = await createCategory({ name: "A", groupId: doomed });

    await deleteCategoryGroup(doomed);

    expect(await transferIdOf(a)).toBe(a);
    expect(await tombstoneOf("categories", a)).toBe(1);
  });

  it("deletes an empty group", async () => {
    await openTestDb();
    const empty = await createCategoryGroup({ name: "Empty" });

    await deleteCategoryGroup(empty);

    expect(await tombstoneOf("category_groups", empty)).toBe(1);
  });

  it("folds the budget of every category in the group onto the target", async () => {
    await openTestDb();
    const keep = await createCategoryGroup({ name: "Keep" });
    const target = await createCategory({ name: "Target", groupId: keep });

    const doomed = await createCategoryGroup({ name: "Doomed" });
    const a = await createCategory({ name: "A", groupId: doomed });
    const b = await createCategory({ name: "B", groupId: doomed });

    await setBudget("2026-03", target, 100);
    await setBudget("2026-03", a, 300);
    await setBudget("2026-03", b, 200);
    await setBudget("2026-04", b, 50);

    await deleteCategoryGroup(doomed, target);

    const march = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [202603, target],
    );
    const april = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [202604, target],
    );
    expect(march?.amount).toBe(600);
    expect(april?.amount).toBe(50);
  });
});
