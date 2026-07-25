import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { first } from "@/core/db";
import {
  setBudgetAmount,
  transferAvailable,
  transferBetweenCategories,
  transferMultipleCategories,
} from "@/core/server/budget/actions";
import { undo } from "@/core/server/undo";
import { monthToInt, currentMonth } from "@/core/shared/months";

/**
 * Characterization tests for the money-mutation functions in
 * src/core/server/budget/actions.ts (plan 005). These pin CURRENT behavior —
 * they are not a spec for how the functions *should* work. See
 * plans/005-money-mutation-tests.md for context and direction-semantics
 * notes for the reviewer.
 *
 * Setup pattern (DB init, category/group creation) copied from
 * getBudgetMonth.test.ts.
 */

async function getBudgeted(month: string, categoryId: string): Promise<number> {
  const monthInt = monthToInt(month);
  const row = await first<{ amount: number }>(
    "SELECT amount FROM zero_budgets WHERE month = ? AND category = ?",
    [monthInt, categoryId],
  );
  return row?.amount ?? 0;
}

/** Creates one expense group with categories A and B, and initializes the
 * spreadsheet (required by transferAvailable, which reads the current
 * budgeted value via the spreadsheet's catBudgeted cell rather than SQL). */
async function setupAB() {
  const group = await createCategoryGroup({ name: "Expenses" });
  const catA = await createCategory({ name: "A", group: group });
  const catB = await createCategory({ name: "B", group: group });
  const { initSpreadsheet } = await import("@/core/server/sheet");
  await initSpreadsheet();
  const month = currentMonth();
  return { catA, catB, month };
}

describe("budgets/index — setBudgetAmount / transferAvailable / transfer* characterization", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("Step 1 setup: creates categories A/B and seeds A with a budgeted amount", async () => {
    await openTestDb();
    const { catA, month } = await setupAB();
    await setBudgetAmount(month, catA, 5000);
    expect(await getBudgeted(month, catA)).toBe(5000);
  });

  describe("setBudgetAmount + transferAvailable", () => {
    it("setBudgetAmount overwrites the budgeted value (absolute, not additive)", async () => {
      await openTestDb();
      const { catA, month } = await setupAB();
      await setBudgetAmount(month, catA, 5000);
      expect(await getBudgeted(month, catA)).toBe(5000);

      await setBudgetAmount(month, catA, 3000);
      expect(await getBudgeted(month, catA)).toBe(3000);
    });

    it("transferAvailable(+) increases budgeted additively", async () => {
      await openTestDb();
      const { catA, month } = await setupAB();
      await setBudgetAmount(month, catA, 5000);

      await transferAvailable(month, catA, 2000);
      expect(await getBudgeted(month, catA)).toBe(7000);
    });

    it("transferAvailable(-) decreases budgeted", async () => {
      await openTestDb();
      const { catA, month } = await setupAB();
      await setBudgetAmount(month, catA, 5000);

      await transferAvailable(month, catA, -2000);
      expect(await getBudgeted(month, catA)).toBe(3000);
    });

    it("amounts are integer cents with no rounding", async () => {
      await openTestDb();
      const { catA, month } = await setupAB();
      await setBudgetAmount(month, catA, 2599);
      expect(await getBudgeted(month, catA)).toBe(2599);
    });
  });

  describe("transferMultipleCategories + transferBetweenCategories", () => {
    it('transferMultipleCategories(..., "to") moves money FROM sources TO the target', async () => {
      await openTestDb();
      const { catA, catB, month } = await setupAB();
      await setBudgetAmount(month, catA, 5000);
      await setBudgetAmount(month, catB, 1000);

      // Direction semantics verified by reading index.ts:572-697 directly:
      // for direction "to", each source's amount -= amountCents and the
      // target's amount += amountCents (sources give TO the target).
      await transferMultipleCategories(
        month,
        catB,
        [{ categoryId: catA, amountCents: 1500, name: "A" }],
        "to",
        "B",
      );

      expect(await getBudgeted(month, catA)).toBe(3500); // -1500
      expect(await getBudgeted(month, catB)).toBe(2500); // +1500
    });

    it("transferMultipleCategories with two sources: both applied, sum conserved", async () => {
      await openTestDb();
      const group = await createCategoryGroup({ name: "Expenses" });
      const catA = await createCategory({ name: "A", group: group });
      const catB = await createCategory({ name: "B", group: group });
      const catC = await createCategory({ name: "C", group: group });
      const { initSpreadsheet } = await import("@/core/server/sheet");
      await initSpreadsheet();
      const month = currentMonth();

      await setBudgetAmount(month, catA, 3000);
      await setBudgetAmount(month, catB, 2000);
      await setBudgetAmount(month, catC, 0);

      const before =
        (await getBudgeted(month, catA)) +
        (await getBudgeted(month, catB)) +
        (await getBudgeted(month, catC));

      await transferMultipleCategories(
        month,
        catC,
        [
          { categoryId: catA, amountCents: 1000, name: "A" },
          { categoryId: catB, amountCents: 500, name: "B" },
        ],
        "to",
        "C",
      );

      expect(await getBudgeted(month, catA)).toBe(2000);
      expect(await getBudgeted(month, catB)).toBe(1500);
      expect(await getBudgeted(month, catC)).toBe(1500);

      const after =
        (await getBudgeted(month, catA)) +
        (await getBudgeted(month, catB)) +
        (await getBudgeted(month, catC));
      expect(after).toBe(before);
    });

    it("transferBetweenCategories moves amountCents from source to target", async () => {
      await openTestDb();
      const { catA, catB, month } = await setupAB();
      await setBudgetAmount(month, catA, 4000);
      await setBudgetAmount(month, catB, 1000);

      await transferBetweenCategories(month, catA, catB, 1000);

      expect(await getBudgeted(month, catA)).toBe(3000);
      expect(await getBudgeted(month, catB)).toBe(2000);
    });
  });

  describe("undo grouping", () => {
    it("undoes a two-source transferMultipleCategories call in a single undo step", async () => {
      // Route taken: call the real undo() API from src/core/server/undo
      // directly (no UI store dependency needed) — the "preferred" route
      // from the plan, not the sendMessages-spy fallback.
      await openTestDb();
      const group = await createCategoryGroup({ name: "Expenses" });
      const catA = await createCategory({ name: "A", group: group });
      const catB = await createCategory({ name: "B", group: group });
      const catC = await createCategory({ name: "C", group: group });
      const { initSpreadsheet } = await import("@/core/server/sheet");
      await initSpreadsheet();
      const month = currentMonth();

      await setBudgetAmount(month, catA, 3000);
      await setBudgetAmount(month, catB, 2000);
      await setBudgetAmount(month, catC, 0);

      await transferMultipleCategories(
        month,
        catC,
        [
          { categoryId: catA, amountCents: 1000, name: "A" },
          { categoryId: catB, amountCents: 500, name: "B" },
        ],
        "to",
        "C",
      );

      expect(await getBudgeted(month, catA)).toBe(2000);
      expect(await getBudgeted(month, catB)).toBe(1500);
      expect(await getBudgeted(month, catC)).toBe(1500);

      const affectedTables = await undo();

      // Both A and B (and C) revert together from a single undo() call —
      // i.e. the whole transferMultipleCategories call is one undo step.
      expect(await getBudgeted(month, catA)).toBe(3000);
      expect(await getBudgeted(month, catB)).toBe(2000);
      expect(await getBudgeted(month, catC)).toBe(0);
      expect(affectedTables).toContain("zero_budgets");
    });
  });
});
