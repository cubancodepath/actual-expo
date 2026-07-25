// Equivalence gate for the warm cache (warm-cache.ts): the grouped prefetch
// queries must feed the leaf cells EXACTLY what their own per-cell firstSync
// queries would return, across the hostile cases — off-budget accounts,
// tombstoned transactions, category merges (category_mapping), carryover
// flags, goals, and buffered amounts. The reference build runs
// createAllBudgetCells directly, which never activates the cache.
import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setArbitraryPref } from "@/core/server/preferences";
import { createAllBudgetCells } from "@/core/server/budget/envelope";
import { createAllBudgetCells as createAllTrackingCells } from "@/core/server/budget/tracking";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
import { currentMonth, addMonths, monthToInt } from "@/core/shared/months";

function snapshotCells(): Map<string, unknown> {
  const snap = new Map<string, unknown>();
  for (const [name, cell] of getSpreadsheet().getCells()) {
    snap.set(name, cell.value);
  }
  return snap;
}

function expectSameCells(actual: Map<string, unknown>, reference: Map<string, unknown>) {
  expect(actual.size).toBeGreaterThan(0);
  expect(actual.size).toBe(reference.size);
  for (const [name, value] of reference) {
    expect(actual.get(name), name).toEqual(value);
  }
}

async function insertTx(
  id: string,
  acct: string,
  category: string | null,
  amount: number,
  date: number,
  tombstone = 0,
) {
  await run(
    "INSERT INTO transactions (id, acct, description, category, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
    [id, acct, "p1", category, amount, date, tombstone, 0, 0],
  );
}

async function seedHostile() {
  const groupId = await createCategoryGroup({ name: "Expenses" });
  const catA = await createCategory({ name: "Groceries", group: groupId });
  const catB = await createCategory({ name: "Transport", group: groupId });
  // A merged-away category that maps onto catA via category_mapping.
  const catMerged = await createCategory({ name: "Old Groceries", group: groupId });
  await run("UPDATE category_mapping SET transferId = ? WHERE id = ?", [catA, catMerged]);

  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "on1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "off1",
    "Brokerage",
    1,
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Shop", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

  const today = currentMonth();
  const m = (offset: number) => Number(`${addMonths(today, offset).replace("-", "")}10`);

  await insertTx("t1", "on1", catA, -1200, m(0));
  await insertTx("t2", "on1", catB, -3400, m(-1));
  await insertTx("t3", "on1", catMerged, -500, m(0)); // must count toward catA
  await insertTx("t4", "off1", catA, -9900, m(0)); // off-budget: excluded
  await insertTx("t5", "on1", catA, -7700, m(0), 1); // tombstoned: excluded
  await insertTx("t6", "on1", null, 25000, m(-2)); // uncategorized income

  // Budget rows with carryover + goals, and a buffered month.
  const thisInt = monthToInt(today);
  const prevInt = monthToInt(addMonths(today, -1));
  await run(
    "INSERT INTO zero_budgets (id, month, category, amount, carryover, goal, long_goal) VALUES (?,?,?,?,?,?,?)",
    [`${prevInt}-${catA}`, prevInt, catA, 15000, 1, 20000, 1],
  );
  await run(
    "INSERT INTO zero_budgets (id, month, category, amount, carryover, goal, long_goal) VALUES (?,?,?,?,?,?,?)",
    [`${thisInt}-${catB}`, thisInt, catB, 8000, 0, null, null],
  );
  await run("INSERT INTO zero_budget_months (id, buffered) VALUES (?,?)", [today, 4200]);

  // Mirror rows for tracking mode.
  await run(
    "INSERT INTO reflect_budgets (id, month, category, amount, carryover) VALUES (?,?,?,?,?)",
    [`${prevInt}-${catA}`, prevInt, catA, 15000, 1],
  );
}

describe("spreadsheet warm cache — equivalence with per-cell queries", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("envelope: warm-cached init matches an uncached reference build", async () => {
    await openTestDb();
    await seedHostile();

    await loadSpreadsheet(); // warm-cached, chunked
    const warmed = snapshotCells();

    const ss = getSpreadsheet();
    ss.clear();
    await createAllBudgetCells(ss); // per-cell firstSync, no cache
    expectSameCells(warmed, snapshotCells());
  });

  it("tracking: warm-cached init matches an uncached reference build", async () => {
    await openTestDb();
    await seedHostile();
    await setArbitraryPref("budgetType", "tracking");

    await loadSpreadsheet();
    const warmed = snapshotCells();

    const ss = getSpreadsheet();
    ss.clear();
    await createAllTrackingCells(ss);
    expectSameCells(warmed, snapshotCells());
  });
});
