import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createCategory, createCategoryGroup } from "@/core/server/budget";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
import { sheetForMonth } from "@/core/server/spreadsheet/bindings";
import { currentMonth, addMonths } from "@/core/shared/months";
import { monthOf, isMonthBuilt, readCategoryBalances } from "../useCategoryBalances";

describe("monthOf", () => {
  it("reads the month out of a YYYYMMDD date", () => {
    expect(monthOf(20260315)).toBe("2026-03");
  });

  it("falls back to the current month for anything that isn't one", () => {
    expect(monthOf(0)).toBe(currentMonth());
  });
});

describe("category balances, read from the sheet", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function budget() {
    const group = await createCategoryGroup({ name: "Bills" });
    const rent = await createCategory({ name: "Rent", groupId: group });
    await loadSpreadsheet();
    return { rent };
  }

  it("reads a balance for every id asked for", async () => {
    await openTestDb();
    const { rent } = await budget();

    const balances = readCategoryBalances(getSpreadsheet(), sheetForMonth(currentMonth()), [rent]);

    expect(balances.has(rent)).toBe(true);
    expect(typeof balances.get(rent)).toBe("number");
  });

  it("says the current month is built, and a far-off one isn't", async () => {
    await openTestDb();
    await budget();
    const ss = getSpreadsheet();

    expect(isMonthBuilt(ss, currentMonth())).toBe(true);
    // Far outside any range the loader would have built.
    expect(isMonthBuilt(ss, addMonths(currentMonth(), 60))).toBe(false);
  });

  it("is why an unbuilt month must be judged by the range, not by the value", async () => {
    await openTestDb();
    const { rent } = await budget();
    const ss = getSpreadsheet();
    const far = addMonths(currentMonth(), 60);

    // The cell doesn't exist, yet reading it yields a perfectly ordinary 0 —
    // indistinguishable from a real zero balance. Hence isMonthBuilt.
    expect(ss.hasCell(sheetForMonth(far), `leftover-${rent}`)).toBe(false);
    expect(readCategoryBalances(ss, sheetForMonth(far), [rent]).get(rent)).toBe(0);
  });
});
