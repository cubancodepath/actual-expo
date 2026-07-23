import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { createAccount } from "@/core/server/accounts";
import { createSchedule } from "@/core/server/schedules";
import { generateForecast } from "../index";

/**
 * End-to-end forecast on a real DB. Uses a far-future window (2099) so the
 * result is independent of the machine's current date (firstForecastDate =
 * max(start, today) resolves to `start`).
 */
let counter = 0;
async function mkTxn(fields: Record<string, string | number | null>): Promise<string> {
  const id = fields.id ? String(fields.id) : `txn-${++counter}`;
  const full = { id, tombstone: 0, isParent: 0, isChild: 0, cleared: 0, ...fields };
  await sendMessages(
    Object.entries(full).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "transactions" as const,
      row: id,
      column,
      value,
    })),
  );
  return id;
}

function balanceOn(
  result: Awaited<ReturnType<typeof generateForecast>>,
  accountId: string,
  date: string,
): number | undefined {
  return result.dataPoints.find((p) => p.accountId === accountId && p.date === date)?.balance;
}

describe("generateForecast — schedules source", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("projects a one-time schedule against a seeded balance", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    await mkTxn({ acct, amount: 100000, date: 20981201 }); // pre-start seed
    await createSchedule({
      schedule: { name: "Rent" },
      conditions: [
        { field: "date", op: "is", value: "2099-02-01" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -10000 },
      ],
    });

    const result = await generateForecast({
      accountIds: [acct],
      startDate: "2099-01-01",
      endDate: "2099-03-31",
    });

    expect(balanceOn(result, acct, "2099-01-31")).toBe(100000); // before the occurrence
    expect(balanceOn(result, acct, "2099-02-01")).toBe(90000); // 100000 − 10000
    expect(balanceOn(result, acct, "2099-03-31")).toBe(90000); // stays
    expect(result.lowestBalance.balance).toBe(90000);

    const occDay = result.dataPoints.find((p) => p.date === "2099-02-01")!;
    expect(occDay.transactions).toHaveLength(1);
    expect(occDay.transactions[0].amount).toBe(-10000);
  });

  it("expands a recurring monthly schedule across the horizon", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    await createSchedule({
      schedule: { name: "Paycheck" },
      conditions: [
        {
          field: "date",
          op: "is",
          value: { frequency: "monthly", interval: 1, start: "2099-01-15" },
        },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: 20000 },
      ],
    });

    const result = await generateForecast({
      accountIds: [acct],
      startDate: "2099-01-01",
      endDate: "2099-03-31",
    });

    // Seed 0; +20000 each occurrence (Jan/Feb/Mar 15).
    expect(balanceOn(result, acct, "2099-01-15")).toBe(20000);
    expect(balanceOn(result, acct, "2099-02-15")).toBe(40000);
    expect(balanceOn(result, acct, "2099-03-15")).toBe(60000);
  });

  it("returns an empty result when no accounts are selected", async () => {
    await openTestDb();
    const result = await generateForecast({ accountIds: [] });
    expect(result.dataPoints).toEqual([]);
    expect(result.lowestBalance.balance).toBe(0);
  });

  it("dedups a schedule occurrence already posted as a real transaction", async () => {
    await openTestDb();
    const acct = await createAccount({ name: "Checking" });
    await mkTxn({ acct, amount: 100000, date: 20981201 });
    const scheduleId = await createSchedule({
      schedule: { name: "Rent" },
      conditions: [
        { field: "date", op: "is", value: "2099-02-01" },
        { field: "account", op: "is", value: acct },
        { field: "amount", op: "is", value: -10000 },
      ],
    });
    // A real posted transaction for that schedule occurrence.
    await mkTxn({ acct, amount: -10000, date: 20990201, schedule: scheduleId });

    const result = await generateForecast({
      accountIds: [acct],
      startDate: "2099-01-01",
      endDate: "2099-03-31",
    });

    // Balance reflects the posted txn (−10000), and the schedule occurrence is
    // NOT double-counted (no synthetic transaction that day).
    expect(balanceOn(result, acct, "2099-02-01")).toBe(90000);
    const occDay = result.dataPoints.find((p) => p.date === "2099-02-01")!;
    expect(occDay.transactions).toHaveLength(0);
  });
});
