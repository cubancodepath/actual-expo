// simpleCashFlow against the real AQL compiler + expo-sqlite dialect: pins the
// filter logic (on-budget only, non-transfer only) and the income/expense split.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { simpleCashFlow, type CashFlowData } from "../cash-flow-spreadsheet";

async function seed() {
  // acc1 on-budget, acc2 off-budget, acc3 is a transfer target account.
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc2",
    "Savings",
    1,
    0,
  ]);
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc3",
    "Brokerage",
    0,
    0,
  ]);

  // p1 is a normal payee; pT is a transfer payee pointing at acc3.
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Employer", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);
  await run("INSERT INTO payees (id, name, transfer_acct, tombstone) VALUES (?,?,?,?)", [
    "pT",
    "Transfer",
    "acc3",
    0,
  ]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["pT", "pT"]);

  const tx = (id: string, acct: string, payee: string, amount: number, date: number) =>
    run(
      "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
      [id, acct, payee, amount, date, 0, 0, 0],
    );

  // on-budget, non-transfer, in range
  await tx("t1", "acc1", "p1", 10000, 20240110); // income
  await tx("t2", "acc1", "p1", -3000, 20240115); // expense
  await tx("t3", "acc1", "p1", -2000, 20240120); // expense
  // off-budget → excluded
  await tx("t4", "acc2", "p1", 50000, 20240112);
  // transfer → excluded
  await tx("t5", "acc1", "pT", -8000, 20240118);
  // out of range → excluded
  await tx("t6", "acc1", "p1", 9999, 20231201);
}

async function collect(): Promise<CashFlowData> {
  let captured: CashFlowData | undefined;
  const runner = simpleCashFlow("2024-01", "2024-01");
  await runner((d) => {
    captured = d;
  });
  return captured!;
}

describe("simpleCashFlow", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("sums income and expenses for on-budget, non-transfer transactions in range", async () => {
    const { graphData } = await collect();
    expect(graphData.income).toBe(10000); // t1 only
    expect(graphData.expense).toBe(-5000); // t2 + t3 (t5 transfer excluded)
  });
});
