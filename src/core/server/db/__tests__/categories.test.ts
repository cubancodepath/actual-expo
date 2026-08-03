import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "./testDb";
import * as db from "@/core/server/db";
import { SORT_INCREMENT } from "@/core/server/db/sort";
import { createCategory, createCategoryGroup } from "@/core/server/budget";
import { applyCategoryOrder } from "@/core/server/budget/apply-order";
import { sortCategories } from "@/core/server/budget/sort-categories";
import { undo } from "@/core/server/undo";

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

  /**
   * The contract the reorder screen is written against: `targetId` names the row
   * to land *before*, and null appends. Everything else about a move — the
   * midpoint arithmetic, the cascading shove — is `shoveSortOrders`' own tests;
   * these cover what a caller can observe.
   */
  describe("moveCategory", () => {
    /** Categories are inserted at the START of a group, so this reads A, B, C. */
    async function groupOfThree(): Promise<{ group: string; ids: string[] }> {
      const group = await createCategoryGroup({ name: "G" });
      const c = await createCategory({ name: "C", groupId: group });
      const b = await createCategory({ name: "B", groupId: group });
      const a = await createCategory({ name: "A", groupId: group });
      return { group, ids: [a, b, c] };
    }

    it("moves a category before its target within a group", async () => {
      await openTestDb();
      const { group, ids } = await groupOfThree();

      await db.moveCategory(ids[2], group, ids[0]);

      expect(await namesInGroup(group)).toEqual(["C", "A", "B"]);
    });

    it("appends to the end of the group when there is no target", async () => {
      await openTestDb();
      const { group, ids } = await groupOfThree();

      await db.moveCategory(ids[0], group, null);

      expect(await namesInGroup(group)).toEqual(["B", "C", "A"]);
    });

    it("rewrites cat_group when the target is in another group", async () => {
      await openTestDb();
      const from = await createCategoryGroup({ name: "From" });
      const to = await createCategoryGroup({ name: "To" });
      const moved = await createCategory({ name: "Rent", groupId: from });
      const anchor = await createCategory({ name: "Water", groupId: to });

      await db.moveCategory(moved, to, anchor);

      expect(await namesInGroup(from)).toEqual([]);
      expect(await namesInGroup(to)).toEqual(["Rent", "Water"]);
    });

    it("keeps the order when the gap runs out and siblings have to be shoved", async () => {
      await openTestDb();
      const group = await createCategoryGroup({ name: "G" });
      const first = await createCategory({ name: "First", groupId: group });
      const second = await createCategory({ name: "Second", groupId: group });
      // Adjacent sort orders leave no midpoint, which is the shove's trigger.
      await db.updateCategory({ id: first, sort_order: 1 });
      await db.updateCategory({ id: second, sort_order: 2 });

      await db.moveCategory(second, group, first);

      expect(await namesInGroup(group)).toEqual(["Second", "First"]);
    });

    it("refuses a move with no group to move into", async () => {
      await openTestDb();
      const group = await createCategoryGroup({ name: "G" });
      const c = await createCategory({ name: "Rent", groupId: group });

      await expect(db.moveCategory(c, "", null)).rejects.toThrow(/groupId is required/);
    });
  });

  describe("moveCategoryGroup", () => {
    async function groupNames(): Promise<string[]> {
      const rows = await db.all<{ name: string }>(
        "SELECT name FROM category_groups WHERE tombstone = 0 ORDER BY sort_order, id",
      );
      return rows.map((r) => r.name);
    }

    it("moves a group before its target", async () => {
      await openTestDb();
      const a = await createCategoryGroup({ name: "A" });
      await createCategoryGroup({ name: "B" });
      const c = await createCategoryGroup({ name: "C" });

      await db.moveCategoryGroup(c, a);

      expect(await groupNames()).toEqual(["C", "A", "B"]);
    });

    it("appends when there is no target", async () => {
      await openTestDb();
      const a = await createCategoryGroup({ name: "A" });
      await createCategoryGroup({ name: "B" });

      await db.moveCategoryGroup(a, null);

      expect(await groupNames()).toEqual(["B", "A"]);
    });
  });

  describe("applyCategoryOrder", () => {
    async function groupNames(): Promise<string[]> {
      const rows = await db.all<{ name: string }>(
        "SELECT name FROM category_groups WHERE tombstone = 0 ORDER BY sort_order, id",
      );
      return rows.map((r) => r.name);
    }

    /** Bills[Rent, Food] · Fun[Games] — ids keyed by name for readable asserts. */
    async function budget() {
      const bills = await createCategoryGroup({ name: "Bills" });
      const fun = await createCategoryGroup({ name: "Fun" });
      const food = await createCategory({ name: "Food", groupId: bills });
      const rent = await createCategory({ name: "Rent", groupId: bills });
      const games = await createCategory({ name: "Games", groupId: fun });
      return { bills, fun, food, rent, games };
    }

    it("reorders groups and categories in one call", async () => {
      await openTestDb();
      const { bills, fun, food, rent, games } = await budget();

      await applyCategoryOrder({
        groups: [fun, bills],
        categories: { [bills]: [food, rent], [fun]: [games] },
      });

      expect(await groupNames()).toEqual(["Fun", "Bills"]);
      expect(await namesInGroup(bills)).toEqual(["Food", "Rent"]);
    });

    it("moves a category into another group", async () => {
      await openTestDb();
      const { bills, fun, food, rent, games } = await budget();

      await applyCategoryOrder({
        groups: [bills, fun],
        categories: { [bills]: [food], [fun]: [rent, games] },
      });

      expect(await namesInGroup(bills)).toEqual(["Food"]);
      expect(await namesInGroup(fun)).toEqual(["Rent", "Games"]);
    });

    it("leaves the sort_order alone when nothing moved", async () => {
      await openTestDb();
      const { bills, fun, rent, food, games } = await budget();
      const before = await db.all<{ id: string; sort_order: number }>(
        "SELECT id, sort_order FROM categories WHERE tombstone = 0 ORDER BY id",
      );

      await applyCategoryOrder({
        groups: [bills, fun],
        categories: { [bills]: [rent, food], [fun]: [games] },
      });

      const after = await db.all<{ id: string; sort_order: number }>(
        "SELECT id, sort_order FROM categories WHERE tombstone = 0 ORDER BY id",
      );
      expect(after).toEqual(before);
    });

    it("ignores hidden categories the screen never listed", async () => {
      await openTestDb();
      const group = await createCategoryGroup({ name: "G" });
      await createCategory({ name: "Hidden", groupId: group, hidden: true });
      const b = await createCategory({ name: "B", groupId: group });
      const a = await createCategory({ name: "A", groupId: group });

      // Only the visible two are listed, and they're already in that order.
      await applyCategoryOrder({ groups: [group], categories: { [group]: [a, b] } });

      expect(await namesInGroup(group)).toContain("Hidden");
      const visible = (await namesInGroup(group)).filter((n) => n !== "Hidden");
      expect(visible).toEqual(["A", "B"]);
    });

    it("undoes the whole arrangement as one step", async () => {
      await openTestDb();
      const { bills, fun, food, rent, games } = await budget();

      await applyCategoryOrder({
        groups: [fun, bills],
        categories: { [bills]: [food, rent], [fun]: [games] },
      });
      await undo();

      expect(await groupNames()).toEqual(["Bills", "Fun"]);
      expect(await namesInGroup(bills)).toEqual(["Rent", "Food"]);
    });
  });
});
