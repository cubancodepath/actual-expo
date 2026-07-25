// Budget switches must not leak the previous file's numbers into the UI.
// Each open builds a fresh Spreadsheet and publishes it (upstream
// loadSpreadsheet/unloadSpreadsheet); subscribers re-seed off the published
// instance. Rebuilding the live instance instead was the actual bug: a cell
// that recomputes to the same 0 its fresh placeholder holds notifies nobody,
// so "Ready to assign" / "holding for next month" kept the old budget's value.
import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setBudgetAmount } from "@/core/server/budget/actions";
import {
  loadSpreadsheet,
  ensureMonthRange,
  unloadSpreadsheet,
  getSpreadsheet,
  getSpreadsheetGeneration,
  subscribeToSpreadsheetSwap,
} from "@/core/server/sheet";
import { resolveName } from "@/core/server/spreadsheet/util";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import {
  warmSpreadsheetCache,
  clearSpreadsheetWarmCache,
  warmSpent,
} from "@/core/server/spreadsheet/warm-cache";
import { currentMonth, addMonths, monthToInt } from "@/core/shared/months";

describe("spreadsheet instance per budget", () => {
  afterEach(async () => {
    await closeTestDb();
    unloadSpreadsheet();
  });

  it("publishes a new instance whose cells hold the new budget's values, even when they compute to 0", async () => {
    // Budget A: something budgeted, so to-budget is non-zero.
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", groupId: groupId });
    await setBudgetAmount(currentMonth(), catId, 10000);
    await loadSpreadsheet();

    const sheet = sheetForMonth(currentMonth());
    const resolved = resolveName(sheet, envelopeBudget.toBudget);
    const before = getSpreadsheet();
    const staleValue = before.getResolved(resolved);
    expect(staleValue).not.toBe(0);

    // Budget B: nothing budgeted anywhere — to-budget is exactly 0, the value
    // a freshly created cell already carries.
    await closeTestDb();
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();

    const after = getSpreadsheet();
    expect(after).not.toBe(before);
    expect(after.getResolved(resolved)).toBe(0);
    // The old instance was never notified — that's precisely why subscribers
    // have to follow the swap instead of waiting for a change event.
    expect(before.getResolved(resolved)).toBe(staleValue);
  });

  it("notifies swap subscribers on publish and on unload", async () => {
    const generations: number[] = [];
    const unsubscribe = subscribeToSpreadsheetSwap(() => {
      generations.push(getSpreadsheetGeneration());
    });
    try {
      await openTestDb();
      await createCategoryGroup({ name: "Expenses" });
      await loadSpreadsheet();
      expect(generations).toHaveLength(1);

      unloadSpreadsheet();
      expect(generations).toHaveLength(2);
      expect(generations[1]).toBeGreaterThan(generations[0]);
    } finally {
      unsubscribe();
    }
  });

  it("gives every published instance a version no consumer has seen before", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();
    const before = getSpreadsheet().version;

    await loadSpreadsheet();
    // Memos keyed on the bare version number must invalidate across the swap.
    expect(getSpreadsheet().version).toBeGreaterThan(before);
  });

  it("unloadSpreadsheet drops the instance and the built range", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();
    const loaded = getSpreadsheet();
    expect(loaded.getCells().size).toBeGreaterThan(0);

    unloadSpreadsheet();

    const empty = getSpreadsheet();
    expect(empty).not.toBe(loaded);
    expect(empty.getCells().size).toBe(0);
    // No range left to extend — a straggler month request must stay a no-op.
    await ensureMonthRange(addMonths(currentMonth(), 8));
    expect(getSpreadsheet().getCells().size).toBe(0);
  });

  it("an in-flight ensureMonthRange from the previous budget neither builds into nor corrupts the new one", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();

    const farMonth = addMonths(currentMonth(), 8);
    // Fire-and-forget, exactly how screens/forecast call it — then switch
    // budgets before it resolves.
    const straggler = ensureMonthRange(farMonth);
    await loadSpreadsheet();
    const metaAfterInit = { ...getSpreadsheet().meta() };
    await straggler;

    const ss = getSpreadsheet();
    expect(ss.hasCell(sheetForMonth(farMonth), envelopeBudget.toBudget)).toBe(false);
    // The straggler recorded its range on the detached instance, not this one.
    expect(ss.meta()).toEqual(metaAfterInit);

    // The built range survived intact: asking again really extends it.
    await ensureMonthRange(farMonth);
    expect(ss.hasCell(sheetForMonth(farMonth), envelopeBudget.toBudget)).toBe(true);
    expect(ss.meta().builtEnd).toBe(farMonth);
  });

  it("records the range and budget type on the instance that holds the cells", async () => {
    await openTestDb();
    await createCategoryGroup({ name: "Expenses" });
    await loadSpreadsheet();

    const meta = getSpreadsheet().meta();
    expect(meta.budgetType).toBe("envelope");
    expect(meta.builtStart).not.toBeNull();
    expect(meta.builtEnd).not.toBeNull();

    unloadSpreadsheet();
    // A fresh empty instance describes nothing — no leftover range to extend.
    expect(getSpreadsheet().meta()).toEqual({
      builtStart: null,
      builtEnd: null,
      budgetType: null,
    });
  });
});

describe("warm cache ownership", () => {
  afterEach(async () => {
    await closeTestDb();
    clearSpreadsheetWarmCache();
    unloadSpreadsheet();
  });

  it("ignores a clear from a superseded pass", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", groupId: groupId });

    const month = currentMonth();
    const monthInt = monthToInt(month);
    const stale = await warmSpreadsheetCache(month, month);
    const current = await warmSpreadsheetCache(month, month);
    expect(current).not.toBe(stale);

    // The stale flow's `finally` must not pull the cache out from under the
    // build that owns it now.
    clearSpreadsheetWarmCache(stale);
    expect(warmSpent(monthInt, catId)).toBe(0);

    clearSpreadsheetWarmCache(current);
    expect(warmSpent(monthInt, catId)).toBeUndefined();
  });

  it("stays inactive when the database is closed", async () => {
    await openTestDb();
    const groupId = await createCategoryGroup({ name: "Expenses" });
    const catId = await createCategory({ name: "Groceries", groupId: groupId });
    const month = currentMonth();

    await closeTestDb();
    await warmSpreadsheetCache(month, month);

    // With no db handle every query answers [] — marking the range "covered"
    // would hand each cell a fabricated 0 instead of letting it re-query.
    expect(warmSpent(monthToInt(month), catId)).toBeUndefined();
  });
});
