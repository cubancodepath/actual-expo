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

/**
 * Showing one category out of a hidden group. Its own flag is already 0, so the
 * group has to open — and the siblings that nobody asked for have to be pinned,
 * or they all come back with it.
 */
describe("unhideItems — a single category out of a hidden group", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function hiddenOf(table: string, id: string): Promise<number | undefined> {
    const row = await first<{ hidden: number }>(`SELECT hidden FROM ${table} WHERE id = ?`, [id]);
    return row?.hidden;
  }

  async function hiddenGroupOfThree() {
    await openTestDb();
    const g = await createCategoryGroup({ name: "Bills" });
    const rent = await createCategory({ name: "Rent", groupId: g });
    const gas = await createCategory({ name: "Gas", groupId: g });
    const water = await createCategory({ name: "Water", groupId: g });
    await updateCategoryGroup(g, { hidden: true });
    return { g, rent, gas, water };
  }

  it("opens the group and pins the siblings, so only the picked one shows", async () => {
    const { g, rent, gas, water } = await hiddenGroupOfThree();

    await unhideItems({ categoryIds: [rent] });

    expect(await hiddenOf("category_groups", g)).toBe(0);
    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(1);
    expect(await hiddenOf("categories", water)).toBe(1);
  });

  it("pins only what wasn't picked when several are", async () => {
    const { g, rent, gas, water } = await hiddenGroupOfThree();

    await unhideItems({ categoryIds: [rent, gas] });

    expect(await hiddenOf("category_groups", g)).toBe(0);
    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(0);
    expect(await hiddenOf("categories", water)).toBe(1);
  });

  // Asking for the group means "bring it back as it was", so nothing is pinned.
  it("pins nothing when the group itself was picked", async () => {
    const { g, rent, gas, water } = await hiddenGroupOfThree();

    await unhideItems({ groupIds: [g] });

    expect(await hiddenOf("category_groups", g)).toBe(0);
    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(0);
    expect(await hiddenOf("categories", water)).toBe(0);
  });

  it("respects a category's own flag when the group is picked", async () => {
    const { g, rent, gas } = await hiddenGroupOfThree();
    await updateCategory(gas, { hidden: true });

    await unhideItems({ groupIds: [g] });

    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(1);
  });

  it("picking both the group and one category leaves the rest alone", async () => {
    const { g, rent, gas, water } = await hiddenGroupOfThree();
    await updateCategory(gas, { hidden: true });

    await unhideItems({ groupIds: [g], categoryIds: [gas] });

    expect(await hiddenOf("category_groups", g)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(0);
    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", water)).toBe(0);
  });

  // A visible group needs no opening, and its other categories are none of our
  // business.
  it("pins nothing when the group was never hidden", async () => {
    await openTestDb();
    const g = await createCategoryGroup({ name: "Visible" });
    const a = await createCategory({ name: "A", groupId: g });
    const b = await createCategory({ name: "B", groupId: g });
    await updateCategory(a, { hidden: true });

    await unhideItems({ categoryIds: [a] });

    expect(await hiddenOf("categories", a)).toBe(0);
    expect(await hiddenOf("categories", b)).toBe(0);
  });

  it("handles two hidden groups independently", async () => {
    await openTestDb();
    const bills = await createCategoryGroup({ name: "Bills" });
    const rent = await createCategory({ name: "Rent", groupId: bills });
    const gas = await createCategory({ name: "Gas", groupId: bills });
    const monthly = await createCategoryGroup({ name: "Monthly" });
    const casa = await createCategory({ name: "Casa", groupId: monthly });
    const carro = await createCategory({ name: "Carro", groupId: monthly });
    await updateCategoryGroup(bills, { hidden: true });
    await updateCategoryGroup(monthly, { hidden: true });

    await unhideItems({ categoryIds: [rent, casa] });

    expect(await hiddenOf("category_groups", bills)).toBe(0);
    expect(await hiddenOf("category_groups", monthly)).toBe(0);
    expect(await hiddenOf("categories", rent)).toBe(0);
    expect(await hiddenOf("categories", gas)).toBe(1);
    expect(await hiddenOf("categories", casa)).toBe(0);
    expect(await hiddenOf("categories", carro)).toBe(1);
  });
});
