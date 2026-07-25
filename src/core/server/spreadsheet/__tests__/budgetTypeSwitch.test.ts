import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setArbitraryPref } from "@/core/server/preferences";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
import { sheetForMonth, envelopeBudget, trackingBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth } from "@/core/shared/months";

describe("loadSpreadsheet — dispatches to the right formula engine by budgetType", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("builds envelope cells (to-budget, buffered) by default", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();

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
    await loadSpreadsheet();

    const ss = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(ss.hasCell(sheet, trackingBudget.totalSaved)).toBe(true);
    // Tracking mode has no to-budget/buffered pool at all.
    expect(ss.hasCell(sheet, envelopeBudget.toBudget)).toBe(false);
  });

  it("rebuilds with the tracking engine's cells after a synced budgetType change", async () => {
    await openTestDb();
    const incomeGroup = await createCategoryGroup({ name: "Income", is_income: true });
    await createCategory({ name: "Paycheck", group: incomeGroup, is_income: true });
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();

    const before = getSpreadsheet();
    const sheet = sheetForMonth(currentMonth());
    expect(before.hasCell(sheet, envelopeBudget.toBudget)).toBe(true);

    // Simulate a peer switching the file to tracking mode via sync — this
    // is exactly what a "preferences"/"budgetType" CRDT message looks like.
    await setArbitraryPref("budgetType", "tracking");

    // triggerBudgetChanges() runs the structural rebuild asynchronously
    // (fire-and-forget, matching the existing categories/groups refresh
    // pattern) — poll briefly for it to land. The rebuild publishes a NEW
    // instance (the whole formula set differs), so re-read the live one.
    for (let i = 0; i < 20 && !getSpreadsheet().hasCell(sheet, trackingBudget.totalSaved); i++) {
      await new Promise((r) => setTimeout(r, 10));
    }

    const after = getSpreadsheet();
    expect(after).not.toBe(before);
    expect(after.hasCell(sheet, trackingBudget.totalSaved)).toBe(true);
    expect(after.hasCell(sheet, envelopeBudget.toBudget)).toBe(false);
  });
});
