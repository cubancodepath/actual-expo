import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { setBudgetAmount } from "@/core/domain/budgets";
import { initSpreadsheet, ensureMonthRange } from "@/core/server/sheet";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth, addMonths } from "@/core/shared/months";

describe("ensureMonthRange — lazy month extension (fix #10)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("builds no cells for a month far outside the initial horizon until ensureMonthRange is called", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", cat_group: groupId });
    await initSpreadsheet();

    // Default mobile horizon is today+3 months — 8 months out is a real gap.
    const farMonth = addMonths(currentMonth(), 8);
    const ss = getSpreadsheet();
    expect(ss.hasCell(sheetForMonth(farMonth), envelopeBudget.toBudget)).toBe(false);

    await ensureMonthRange(farMonth);

    expect(ss.hasCell(sheetForMonth(farMonth), envelopeBudget.toBudget)).toBe(true);
    expect(ss.hasCell(sheetForMonth(farMonth), envelopeBudget.catBalance(catId))).toBe(true);
  });

  it("is a no-op when the requested month is already within the built range", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await initSpreadsheet();

    const ss = getSpreadsheet();
    const versionBefore = ss.getCells().size;
    await ensureMonthRange(currentMonth());
    expect(ss.getCells().size).toBe(versionBefore);
  });

  it("carries a category balance forward correctly through the gap it fills (no missing prevSheet reads)", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", cat_group: groupId });
    await initSpreadsheet();

    const today = currentMonth();
    await setBudgetAmount(today, catId, 10000); // budget $100.00, never spent

    const farMonth = addMonths(today, 6);
    await ensureMonthRange(farMonth);

    // With no spending and no re-budgeting, the leftover balance must carry
    // forward unchanged through every intermediate month. If any month in
    // the gap were built out of order, its prevSheet cells would be missing
    // and resolve to 0, breaking the chain.
    const ss = getSpreadsheet();
    const balance = ss.getValue(sheetForMonth(farMonth), envelopeBudget.catBalance(catId));
    expect(balance).toBe(10000);
  });

  it("extends backward correctly when navigating to a month before the built range", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await initSpreadsheet();

    const earlyMonth = addMonths(currentMonth(), -10);
    const ss = getSpreadsheet();
    expect(ss.hasCell(sheetForMonth(earlyMonth), envelopeBudget.toBudget)).toBe(false);

    await ensureMonthRange(earlyMonth);

    expect(ss.hasCell(sheetForMonth(earlyMonth), envelopeBudget.toBudget)).toBe(true);
  });
});
