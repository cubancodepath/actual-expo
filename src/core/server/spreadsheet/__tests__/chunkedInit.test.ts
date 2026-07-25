// Guards the chunked loadSpreadsheet: building months in yielded chunks (each
// in its own transaction) must produce exactly the same cells and values as
// upstream's single-transaction createAllBudgetCells.
import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setBudgetAmount } from "@/core/server/budget/actions";
import { createAllBudgetCells } from "@/core/server/budget/envelope";
import { loadSpreadsheet, getSpreadsheet } from "@/core/server/sheet";
import { sheetForMonth, envelopeBudget } from "@/core/server/spreadsheet/bindings";
import { currentMonth, addMonths } from "@/core/shared/months";

/** All resolved cell names → computed values. */
function snapshotCells(): Map<string, unknown> {
  const ss = getSpreadsheet();
  const snap = new Map<string, unknown>();
  for (const [name, cell] of ss.getCells()) {
    snap.set(name, cell.value);
  }
  return snap;
}

async function seed() {
  const groupId = await createCategoryGroup({ name: "Expenses" });
  const catId = await createCategory({ name: "Groceries", group: groupId });

  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Shop", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

  // Transactions spread over ~14 months back so the budget range spans
  // several 6-month chunks and the carryover chain crosses chunk boundaries.
  const today = currentMonth();
  for (let i = 0; i <= 14; i += 2) {
    const month = addMonths(today, -i);
    const dateInt = Number(`${month.replace("-", "")}15`);
    await run(
      "INSERT INTO transactions (id, acct, description, category, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
      [`t${i}`, "acc1", "p1", catId, -1000 - i * 100, dateInt, 0, 0, 0],
    );
  }
  // Budget some money in a few months so catBalance chains non-trivially.
  await setBudgetAmount(addMonths(today, -12), catId, 50000);
  await setBudgetAmount(addMonths(today, -6), catId, 20000);
  await setBudgetAmount(today, catId, 10000);

  return { catId };
}

describe("chunked loadSpreadsheet", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("produces identical cells and values to single-transaction createAllBudgetCells", async () => {
    await openTestDb();
    const { catId } = await seed();

    await loadSpreadsheet();
    const chunked = snapshotCells();

    // Reference build: upstream's one-big-transaction path on a cleared sheet.
    const ss = getSpreadsheet();
    ss.clear();
    await createAllBudgetCells(ss);
    const reference = snapshotCells();

    expect(chunked.size).toBeGreaterThan(0);
    expect(chunked.size).toBe(reference.size);
    for (const [name, value] of reference) {
      expect(chunked.get(name), name).toEqual(value);
    }

    // Sanity: the carryover chain reached the current month with a real value.
    const balance = ss.getValue(sheetForMonth(currentMonth()), envelopeBudget.catBalance(catId));
    expect(typeof balance).toBe("number");
    expect(balance).not.toBe(0);
  });

  it("reports monotonic progress ending at total", async () => {
    await openTestDb();
    await seed();

    const calls: Array<[number, number]> = [];
    await loadSpreadsheet((done, total) => calls.push([done, total]));

    expect(calls.length).toBeGreaterThan(1); // multi-chunk range
    const total = calls[0][1];
    expect(calls.every(([, t]) => t === total)).toBe(true);
    const dones = calls.map(([d]) => d);
    expect([...dones].sort((a, b) => a - b)).toEqual(dones);
    expect(dones.at(-1)).toBe(total);
  });
});
