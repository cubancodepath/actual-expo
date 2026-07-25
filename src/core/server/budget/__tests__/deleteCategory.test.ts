import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import { createCategoryGroup, createCategory, deleteCategory } from "../index";

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
