import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { first } from "@/core/server/db";
import { createCategoryGroup, createCategory } from "../index";
import { doTransfer, setBudget } from "../actions";

/**
 * The money half of a delete: budgeted amounts have to follow the transactions,
 * or they evaporate with the tombstoned rows.
 */
describe("doTransfer", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function budgetedOf(month: string, categoryId: string): Promise<number> {
    const monthInt = Number(month.replace("-", ""));
    const row = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [monthInt, categoryId],
    );
    return row?.amount ?? 0;
  }

  async function setup() {
    await openTestDb();
    const group = await createCategoryGroup({ name: "G" });
    const target = await createCategory({ name: "Target", groupId: group });
    const a = await createCategory({ name: "A", groupId: group });
    const b = await createCategory({ name: "B", groupId: group });
    return { group, target, a, b };
  }

  it("folds several categories' amounts onto the target, month by month", async () => {
    const { target, a, b } = await setup();
    await setBudget("2026-03", a, 1000);
    await setBudget("2026-03", b, 500);
    await setBudget("2026-04", a, 700);

    await doTransfer([a, b], target);

    expect(await budgetedOf("2026-03", target)).toBe(1500);
    expect(await budgetedOf("2026-04", target)).toBe(700);
  });

  it("adds to what the target already had rather than overwriting it", async () => {
    const { target, a } = await setup();
    await setBudget("2026-03", target, 2000);
    await setBudget("2026-03", a, 250);

    await doTransfer([a], target);

    expect(await budgetedOf("2026-03", target)).toBe(2250);
  });

  // Upstream doesn't debit the sources either: their rows are tombstoned by the
  // delete that follows, so a write nobody reads would be noise.
  it("leaves the sources untouched", async () => {
    const { target, a } = await setup();
    await setBudget("2026-03", a, 1000);

    await doTransfer([a], target);

    expect(await budgetedOf("2026-03", a)).toBe(1000);
  });

  /**
   * The reason this reads the table instead of `getBuiltMonths()`. The built
   * window starts at three months back on mobile; a budget parked further out
   * still has to move, and a spreadsheet-driven version would drop it silently.
   */
  it("moves amounts from months outside the spreadsheet's built window", async () => {
    const { target, a } = await setup();
    await setBudget("2019-01", a, 4200);

    await doTransfer([a], target);

    expect(await budgetedOf("2019-01", target)).toBe(4200);
  });

  it("ignores months where the source budgeted nothing", async () => {
    const { target, a } = await setup();
    await setBudget("2026-03", a, 0);

    await doTransfer([a], target);

    const row = await first<{ amount: number }>(
      "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
      [202603, target],
    );
    expect(row).toBeNull();
  });

  it("does nothing when handed no categories", async () => {
    const { target } = await setup();

    await expect(doTransfer([], target)).resolves.toBeUndefined();
  });
});
