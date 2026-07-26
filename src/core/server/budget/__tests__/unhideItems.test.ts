import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import {
  createCategoryGroup,
  createCategory,
  updateCategory,
  updateCategoryGroup,
  unhideItems,
} from "../index";

/**
 * The way back from hiding. Recovering a group matters most: the budget screens
 * skip a hidden group before they look inside it, so until this existed nothing
 * in the app could set a group's `hidden` back to 0.
 */
describe("unhideItems", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function hiddenOf(table: string, id: string): Promise<number | undefined> {
    const row = await first<{ hidden: number }>(`SELECT hidden FROM ${table} WHERE id = ?`, [id]);
    return row?.hidden;
  }

  it("shows a hidden category again", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const c = await createCategory({ name: "C", groupId: g });
    await updateCategory(c, { hidden: true });
    expect(await hiddenOf("categories", c)).toBe(1);

    await unhideItems({ categoryIds: [c] });

    expect(await hiddenOf("categories", c)).toBe(0);
  });

  it("shows a hidden group again", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    await updateCategoryGroup(g, { hidden: true });
    expect(await hiddenOf("category_groups", g)).toBe(1);

    await unhideItems({ groupIds: [g] });

    expect(await hiddenOf("category_groups", g)).toBe(0);
  });

  it("handles a mixed sweep in one call", async () => {
    await openTestDb();
    const kept = await createCategoryGroup({ name: "Kept" });
    const a = await createCategory({ name: "A", groupId: kept });
    const b = await createCategory({ name: "B", groupId: kept });
    const doomed = await createCategoryGroup({ name: "Doomed" });
    await updateCategory(a, { hidden: true });
    await updateCategory(b, { hidden: true });
    await updateCategoryGroup(doomed, { hidden: true });

    await unhideItems({ categoryIds: [a, b], groupIds: [doomed] });

    expect(await hiddenOf("categories", a)).toBe(0);
    expect(await hiddenOf("categories", b)).toBe(0);
    expect(await hiddenOf("category_groups", doomed)).toBe(0);
  });

  it("does nothing when handed nothing", async () => {
    await openTestDb();

    await expect(unhideItems({})).resolves.toBeUndefined();
  });

  it("leaves everything else alone", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: g });
    const other = await createCategory({ name: "Other", groupId: g });
    await updateCategory(target, { hidden: true });
    await updateCategory(other, { hidden: true });

    await unhideItems({ categoryIds: [target] });

    expect(await hiddenOf("categories", target)).toBe(0);
    expect(await hiddenOf("categories", other)).toBe(1);
  });
});
