// calendarSpreadsheet against the real AQL compiler + expo-sqlite dialect: pins
// the per-day income/expense sums, the month totals, and the bar-size % (value /
// month total * 100).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { calendarSpreadsheet, type CalendarMonthData } from "../calendar-spreadsheet";

async function seed() {
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Store", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

  const tx = (id: string, amount: number, date: number) =>
    run(
      "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
      [id, "acc1", "p1", amount, date, 0, 0, 0],
    );

  // 2024-01: income 10000 (day 5) + 30000 (day 20) = 40000
  //          expense 4000 (day 10) + 6000 (day 10) = 10000 on the same day
  await tx("t1", 10000, 20240105);
  await tx("t2", 30000, 20240120);
  await tx("t3", -4000, 20240110);
  await tx("t4", -6000, 20240110);
  // out of month → ignored
  await tx("t5", 99999, 20240205);
}

async function collect(month: string): Promise<CalendarMonthData> {
  let captured: CalendarMonthData | undefined;
  const runner = calendarSpreadsheet(month);
  await runner((d) => {
    captured = d;
  });
  return captured!;
}

describe("calendarSpreadsheet", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("sums per-day income/expense and month totals for the given month", async () => {
    const { daysByKey, totalIncome, totalExpense } = await collect("2024-01");

    expect(totalIncome).toBe(40000);
    expect(totalExpense).toBe(10000);

    expect(daysByKey["2024-01-05"].incomeValue).toBe(10000);
    expect(daysByKey["2024-01-20"].incomeValue).toBe(30000);
    // Two expenses on the same day are summed by the groupBy('date').
    expect(daysByKey["2024-01-10"].expenseValue).toBe(10000);

    // Days outside the month are excluded.
    expect(daysByKey["2024-02-05"]).toBeUndefined();
  });

  it("computes bar size as a percentage of the month total", async () => {
    const { daysByKey } = await collect("2024-01");
    // 10000 / 40000 = 25%, 30000 / 40000 = 75%
    expect(daysByKey["2024-01-05"].incomeSize).toBe(25);
    expect(daysByKey["2024-01-20"].incomeSize).toBe(75);
    // Sole expense day → 100% of the expense total.
    expect(daysByKey["2024-01-10"].expenseSize).toBe(100);
  });
});
