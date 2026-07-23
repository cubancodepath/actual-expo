import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/domain/categories";
import { setArbitraryPref } from "@/core/server/preferences";
import { initSpreadsheet } from "@/core/domain/spreadsheet/sync";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { sheetForMonth, envelopeBudget, trackingBudget } from "@/core/domain/spreadsheet/bindings";
import { currentMonth } from "@/core/shared/months";

describe("initSpreadsheet — dispatches to the right formula engine by budgetType", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("builds envelope cells (to-budget, buffered) by default", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await initSpreadsheet();

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(ss.hasCell(sheet, envelopeBudget.toBudget)).toBe(true);
    expect(ss.hasCell(sheet, trackingBudget.totalSaved)).toBe(false);
  });

  it("builds tracking cells (total-saved, real-saved) when budgetType is 'tracking'", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Income", is_income: true });
    await createCategoryGroup({ name: "Expenses" });
    await setArbitraryPref("budgetType", "tracking");
    await initSpreadsheet();

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(ss.hasCell(sheet, trackingBudget.totalSaved)).toBe(true);
    // Tracking mode has no to-budget/buffered pool at all.
    expect(ss.hasCell(sheet, envelopeBudget.toBudget)).toBe(false);
  });

  it("rebuilds with the tracking engine's cells after a synced budgetType change", async () => {
    await openTestDb();
    const incomeGroup = await createCategoryGroup({ name: "Income", is_income: true });
    await createCategory({ name: "Paycheck", cat_group: incomeGroup, is_income: true });
    await createCategoryGroup({ name: "Expenses" });
    await initSpreadsheet();

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(ss.hasCell(sheet, envelopeBudget.toBudget)).toBe(true);

    // Simulate a peer switching the file to tracking mode via sync — this
    // is exactly what a "preferences"/"budgetType" CRDT message looks like.
    await setArbitraryPref("budgetType", "tracking");

    // triggerBudgetChanges() runs the structural rebuild asynchronously
    // (fire-and-forget, matching the existing categories/groups refresh
    // pattern) — poll briefly for it to land.
    for (let i = 0; i < 20 && !ss.hasCell(sheet, trackingBudget.totalSaved); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    expect(ss.hasCell(sheet, trackingBudget.totalSaved)).toBe(true);
    expect(ss.hasCell(sheet, envelopeBudget.toBudget)).toBe(false);
  });
});
