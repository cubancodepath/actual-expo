import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "./testDb";
import * as db from "@/core/server/db";
import { SORT_INCREMENT } from "@/core/server/db/sort";
import { createCategory, createCategoryGroup } from "@/core/server/budget";
import { sortCategories } from "@/core/server/budget/sort-categories";

/**
 * The rules the DB layer owns — duplicate names, sort_order, the self-mapping —
 * plus the bits the handler layer adds on top (trim, groupId, is_income).
 * Upstream keeps the equivalents in `server/db/index.test.ts`.
 */
describe("db categories", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function namesInGroup(groupId: string): Promise<string[]> {
    const rows = await db.all<{ name: string }>(
      "SELECT name FROM categories WHERE cat_group = ? AND tombstone = 0 ORDER BY sort_order, id",
      [groupId],
    );
    return rows.map((r) => r.name);
  }

  describe("duplicate names", () => {
    it("rejects a duplicate category in the same group, case-insensitively", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      await createCategory({ name: "Rent", groupId: g });

      await expect(createCategory({ name: "rent", groupId: g })).rejects.toThrow(
        /already exists in group/,
      );
    });

    it("allows the same name in a different group", async () => {
      await openTestDb();
      const a = await createCategoryGroup({ name: "A" });
      const b = await createCategoryGroup({ name: "B" });
      await createCategory({ name: "Rent", groupId: a });

      await expect(createCategory({ name: "Rent", groupId: b })).resolves.toBeTruthy();
    });

    it("counts hidden categories as duplicates", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      await createCategory({ name: "Rent", groupId: g, hidden: true });

      await expect(createCategory({ name: "Rent", groupId: g })).rejects.toThrow(
        /already exists in group/,
      );
    });

    it("rejects a duplicate group name", async () => {
      await openTestDb();
      await createCategoryGroup({ name: "Bills" });

      await expect(createCategoryGroup({ name: "bills" })).rejects.toThrow(
        /category group already exists/,
      );
    });

    it("rejects renaming a group onto an existing name", async () => {
      await openTestDb();
      await createCategoryGroup({ name: "Bills" });
      const other = await createCategoryGroup({ name: "Other" });

      await expect(db.updateCategoryGroup({ id: other, name: "Bills" })).rejects.toThrow(
        /category group already exists/,
      );
    });
  });

  describe("sort_order", () => {
    it("puts a new category at the START of its group, like upstream", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      await createCategory({ name: "First", groupId: g });
      await createCategory({ name: "Second", groupId: g });

      expect(await namesInGroup(g)).toEqual(["Second", "First"]);
    });

    it("appends when insertCategory is asked for atEnd", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      await db.insertCategory({ name: "First", cat_group: g }, { atEnd: true });
      await db.insertCategory({ name: "Second", cat_group: g }, { atEnd: true });

      expect(await namesInGroup(g)).toEqual(["First", "Second"]);
    });

    it("uses the SORT_INCREMENT scale, not a timestamp", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      const row = await db.first<{ sort_order: number }>(
        "SELECT sort_order FROM category_groups WHERE id = ?",
        [g],
      );

      expect(row?.sort_order).toBe(SORT_INCREMENT);
    });

    it("appends groups in creation order", async () => {
      await openTestDb();
      await createCategoryGroup({ name: "A" });
      await createCategoryGroup({ name: "B" });

      const rows = await db.all<{ name: string }>(
        "SELECT name FROM category_groups WHERE tombstone = 0 ORDER BY sort_order, id",
      );
      expect(rows.map((r) => r.name)).toEqual(["A", "B"]);
    });
  });

  describe("handler validation", () => {
    it("trims the name", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "  G  " });
      const c = await createCategory({ name: "  Rent  ", groupId: g });

      expect((await db.getCategory(c))?.name).toBe("Rent");
      const group = await db.first<{ name: string }>(
        "SELECT name FROM category_groups WHERE id = ?",
        [g],
      );
      expect(group?.name).toBe("G");
    });

    it("requires a groupId", async () => {
      await openTestDb();
      await expect(createCategory({ name: "Rent", groupId: "" })).rejects.toThrow(
        /groupId is required/,
      );
    });

    it("stores is_income as given by the caller", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "Income", isIncome: true });
      const c = await createCategory({ name: "Salary", groupId: g, isIncome: true });

      const row = await db.first<{ is_income: number }>(
        "SELECT is_income FROM categories WHERE id = ?",
        [c],
      );
      expect(row?.is_income).toBe(1);
    });

    it("defaults is_income and hidden to 0", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      const c = await createCategory({ name: "Rent", groupId: g });

      const row = await db.first<{ is_income: number; hidden: number }>(
        "SELECT is_income, hidden FROM categories WHERE id = ?",
        [c],
      );
      expect(row).toMatchObject({ is_income: 0, hidden: 0 });
    });
  });

  it("creates the self-referential category_mapping row", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "Rent", groupId: g });

    const row = await db.first<{ transferId: string }>(
      "SELECT transferId FROM category_mapping WHERE id = ?",
      [c],
    );
    expect(row?.transferId).toBe(c);
  });

  describe("sortCategories", () => {
    it("sorts a group's categories alphabetically, ascending and descending", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      for (const name of ["Banana", "Apple", "Cherry"]) {
        await createCategory({ name, groupId: g });
      }

      await sortCategories({ groupId: g, direction: "asc" });
      expect(await namesInGroup(g)).toEqual(["Apple", "Banana", "Cherry"]);

      await sortCategories({ groupId: g, direction: "desc" });
      expect(await namesInGroup(g)).toEqual(["Cherry", "Banana", "Apple"]);
    });

    it("is a no-op for an empty group", async () => {
      await openTestDb();
      const g = await createCategoryGroup({ name: "G" });
      await expect(sortCategories({ groupId: g, direction: "asc" })).resolves.toBeUndefined();
    });
  });
});
