// Cold-start cache (sheet.ts kvcache hooks + Spreadsheet preloads).
//
// The value is skipping the SQL rebuild on every budget open; the danger is a
// cache that claims to be trustworthy while describing older data. These tests
// pin both: warm values must equal cold values exactly, and every path that
// mutates data must leave the cache dirty until the cells have caught up.
//
// "Did the build query, or did it read the cache?" is asserted without mocks:
// a raw SQL write bypasses CRDT, so nothing invalidates the cache — a build
// that queries sees the new number, a build that trusts the cache sees the old
// one. That distinction is the whole feature.
import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first, run, runQuery, serializeDbWrite, transaction } from "@/core/db";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setBudgetAmount } from "@/core/server/budget/actions";
import {
  loadSpreadsheet,
  unloadSpreadsheet,
  getSpreadsheet,
  __setSpreadsheetCacheEnabled,
} from "@/core/server/sheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { resolveName } from "@/core/server/spreadsheet/util";
import { currentMonth, monthToInt } from "@/core/shared/months";

const CACHE_FORMAT_KEY = "__cache_format__";

/** The debounced flush is 250ms; give it room to land. */
async function settleCache(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 400));
}

async function isMarkedClean(): Promise<boolean> {
  const mark = await first<{ key: number }>("SELECT key FROM kvcache_key WHERE id = 1");
  return mark != null;
}

function snapshotValues(): Map<string, unknown> {
  const snap = new Map<string, unknown>();
  for (const [name, cell] of getSpreadsheet().getCells()) {
    // JSON has no -0, so a restored value comes back as +0. The engine itself
    // compares with !== (where -0 === 0), so the two are indistinguishable to
    // everything downstream — normalize rather than assert a false difference.
    snap.set(name, Object.is(cell.value, -0) ? 0 : cell.value);
  }
  return snap;
}

async function seedBudget(): Promise<string> {
  const groupId = await createCategoryGroup({ name: "Expenses" });
  const catId = await createCategory({ name: "Groceries", group: groupId });
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acct1",
    "Checking",
    0,
    0,
  ]);
  const monthInt = monthToInt(currentMonth());
  await run(
    "INSERT INTO transactions (id, acct, description, category, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
    ["tx1", "acct1", "p", catId, -2500, monthInt * 100 + 5, 0, 0, 0],
  );
  await setBudgetAmount(currentMonth(), catId, 10000);
  return catId;
}

/** Change the stored budget amount behind the engine's back — no CRDT, no invalidation. */
async function rawSetBudget(catId: string, amount: number): Promise<void> {
  await run("UPDATE zero_budgets SET amount = ? WHERE month = ? AND category = ?", [
    amount,
    monthToInt(currentMonth()),
    catId,
  ]);
}

function budgetedValue(catId: string): unknown {
  return getSpreadsheet().getValue(
    sheetForMonth(currentMonth()),
    envelopeBudget.catBudgeted(catId),
  );
}

describe("spreadsheet value cache", () => {
  afterEach(async () => {
    __setSpreadsheetCacheEnabled(false);
    await closeTestDb();
    unloadSpreadsheet();
  });

  it("a warm open reproduces the cold build's values exactly", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    await seedBudget();

    await loadSpreadsheet();
    const cold = snapshotValues();
    expect(cold.size).toBeGreaterThan(0);
    await settleCache();
    expect(await isMarkedClean()).toBe(true);

    await loadSpreadsheet();
    const warm = snapshotValues();

    expect(warm.size).toBe(cold.size);
    for (const [name, value] of cold) {
      expect(warm.get(name), name).toEqual(value);
    }
  });

  it("a warm open reads cached values instead of querying", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();
    await loadSpreadsheet();
    await settleCache();

    await rawSetBudget(catId, 55500);
    await loadSpreadsheet();

    // Still the cached number: the build never asked the database.
    expect(budgetedValue(catId)).toBe(10000);
  });

  it("rebuilds from SQL when the cache format version no longer matches", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();
    await loadSpreadsheet();
    await settleCache();

    await rawSetBudget(catId, 55500);
    // Simulate an app update that changed cell formulas.
    await run("UPDATE kvcache SET value = ? WHERE key = ?", ["999", CACHE_FORMAT_KEY]);

    await loadSpreadsheet();
    expect(budgetedValue(catId)).toBe(55500);
  });

  it("rebuilds from SQL when no cache has been written yet", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();

    await loadSpreadsheet();
    expect(budgetedValue(catId)).toBe(10000);

    // Nothing was ever marked clean, so this is still a cold build.
    await rawSetBudget(catId, 55500);
    unloadSpreadsheet();
    await loadSpreadsheet();
    expect(budgetedValue(catId)).toBe(55500);
  });

  it("never loads its own bookkeeping row as a cell", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    await seedBudget();
    await loadSpreadsheet();
    await settleCache();

    await loadSpreadsheet();
    expect(getSpreadsheet().getCells().has(CACHE_FORMAT_KEY)).toBe(false);
  });

  it("goes dirty the moment data changes and only goes clean once the cells catch up", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();
    await loadSpreadsheet();
    await settleCache();
    expect(await isMarkedClean()).toBe(true);

    await setBudgetAmount(currentMonth(), catId, 20000);
    // The mutation window drops the mark as the write happens.
    expect(await isMarkedClean()).toBe(false);

    await settleCache();
    expect(await isMarkedClean()).toBe(true);

    // And the re-marked cache carries the NEW value, not the old one.
    const rows = await runQuery<{ key: string; value: string }>(
      "SELECT key, value FROM kvcache WHERE key = ?",
      [resolveName(sheetForMonth(currentMonth()), envelopeBudget.catBudgeted(catId))],
    );
    expect(JSON.parse(rows[0].value)).toBe(20000);
  });

  it("a mutation's new values survive into the next open", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();
    await loadSpreadsheet();
    await settleCache();

    await setBudgetAmount(currentMonth(), catId, 33300);
    await settleCache();

    await loadSpreadsheet();
    expect(budgetedValue(catId)).toBe(33300);
  });

  it("drops unconsumed preloads once data changes, so months built later compute fresh", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    const catId = await seedBudget();
    await loadSpreadsheet();
    await settleCache();

    // Reopen warm: every cached value is now sitting in the preload map,
    // including ones for cells this build already created.
    await loadSpreadsheet();
    expect(getSpreadsheet().hasPreloadedValues()).toBe(true);

    await setBudgetAmount(currentMonth(), catId, 44400);

    // A mutation invalidates the whole snapshot — nothing built from here on
    // may adopt a value read before it.
    expect(getSpreadsheet().hasPreloadedValues()).toBe(false);
    expect(budgetedValue(catId)).toBe(44400);
  });

  it("survives a flush that fires while a sync apply holds a transaction open", async () => {
    // The debounced flush runs off a timer, so it lands wherever it lands —
    // including inside applyMessages' transaction. SQLite has no nested
    // transactions, so before both queued on the shared write gate this
    // logged "cannot start a transaction within a transaction" and the cache
    // silently never got written.
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    await seedBudget();
    await loadSpreadsheet(); // queues a full-graph flush 250ms out

    // Stand in for a slow apply: hold a transaction open right across the
    // debounce window, so the flush timer fires while it is still open.
    await serializeDbWrite(() =>
      transaction(async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }),
    );
    await settleCache();

    // The flush completed rather than erroring out.
    expect(await isMarkedClean()).toBe(true);
    const rows = await runQuery<{ n: number }>("SELECT COUNT(*) AS n FROM kvcache");
    expect(rows[0].n).toBeGreaterThan(1);
  });

  it("an unfinished flush leaves the cache dirty rather than half-written", async () => {
    __setSpreadsheetCacheEnabled(true);
    await openTestDb();
    await seedBudget();
    await loadSpreadsheet();

    // Killed before the debounced flush could run.
    unloadSpreadsheet();
    await settleCache();

    expect(await isMarkedClean()).toBe(false);
  });
});
