// Guards the grouped-query divergence in net-worth-spreadsheet.ts: two
// account-grouped AQL queries regrouped in JS must yield the same per-account
// numbers the old 2-queries-per-account shape produced.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enUS } from "date-fns/locale";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run } from "@/core/server/db";
import { createSpreadsheet, type NetWorthData } from "../net-worth-spreadsheet";

async function insertTx(id: string, acct: string, amount: number, date: number) {
  await run(
    "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
    [id, acct, "p1", amount, date, 0, 0, 0],
  );
}

async function seed() {
  for (const [id, name] of [
    ["acc1", "Checking"],
    ["acc2", "Savings"],
    ["acc3", "Empty"],
  ]) {
    await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
      id,
      name,
      0,
      0,
    ]);
  }
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Shop", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

  // acc1: 100 before the lookback start (→ starting balance), then activity.
  await insertTx("t0", "acc1", 100, 20231215);
  await insertTx("t1", "acc1", 10000, 20240110);
  await insertTx("t2", "acc1", -2000, 20240215);
  await insertTx("t3", "acc1", 500, 20240320);
  // acc2: activity only.
  await insertTx("t4", "acc2", 5000, 20240131);
  await insertTx("t5", "acc2", 1000, 20240210);
  // acc3: no transactions at all.
}

const ACCOUNTS = [
  { id: "acc1", name: "Checking" },
  { id: "acc2", name: "Savings" },
  { id: "acc3", name: "Empty" },
];

function runSpreadsheet(): Promise<NetWorthData> {
  return new Promise((resolve) => {
    const getData = createSpreadsheet(
      "2024-02",
      "2024-03",
      ACCOUNTS,
      [],
      "and",
      enUS,
      "Monthly",
      "0",
      (v) => String(v),
    );
    void getData(resolve);
  });
}

describe("net worth spreadsheet (grouped queries)", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("matches the per-account arithmetic", async () => {
    const data = await runSpreadsheet();

    // Lookback starts 2024-01 (one month before the range). Running totals:
    //   acc1: starting 100 → Jan 10100 → Feb 8100 → Mar 8600
    //   acc2: starting   0 → Jan  5000 → Feb 6000 → Mar 6000
    // Net worth per month: 15100, 14100, 14600.
    expect(data.graphData.data.map((p) => p.y)).toEqual([15100, 14100, 14600]);
    expect(data.netWorth).toBe(14600);
    expect(data.totalChange).toBe(14600 - 15100);
    expect(data.lowestNetWorth).toBe(14100);
    expect(data.highestNetWorth).toBe(15100);
  });

  it("drops accounts with no balance from the legend", async () => {
    const data = await runSpreadsheet();

    expect(data.accounts.map((a) => a.id).sort()).toEqual(["acc1", "acc2"]);
  });
});
