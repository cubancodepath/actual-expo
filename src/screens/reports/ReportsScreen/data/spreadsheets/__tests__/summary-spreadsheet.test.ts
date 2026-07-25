// summarySpreadsheet against the real AQL compiler + expo-sqlite dialect. Covers
// the `sum` path and the `percentage` path (which runs a second, divisor query
// built from conditions via conditionsToAQL).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { enUS } from "date-fns/locale";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run } from "@/core/server/db";
import type { SummaryContent } from "@/core/types/models/dashboard";
import { summarySpreadsheet, type SummaryData } from "../summary-spreadsheet";

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

  await tx("t1", 10000, 20240105);
  await tx("t2", -4000, 20240115);
  await tx("t3", -2000, 20240125);
}

async function collect(content: SummaryContent): Promise<SummaryData> {
  let captured: SummaryData | undefined;
  const runner = summarySpreadsheet("2024-01", "2024-01", [], "and", content, enUS);
  await runner((d) => {
    captured = d;
  });
  return captured!;
}

describe("summarySpreadsheet", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("sum totals all matching transactions in range", async () => {
    const data = await collect({ type: "sum" });
    expect(data.total).toBe(4000); // 10000 - 4000 - 2000
  });

  it("percentage divides the numerator set by a divisor condition set", async () => {
    // Numerator: no conditions → all three (net 4000).
    // Divisor: only positive amounts (gt 0) → 10000. 4000/10000 = 40%.
    const content: SummaryContent = {
      type: "percentage",
      divisorConditions: [{ field: "amount", op: "gt", value: 0 }],
      divisorConditionsOp: "and",
    };
    const data = await collect(content);
    expect(data.divisor).toBe(10000);
    expect(data.dividend).toBe(4000);
    expect(data.total).toBe(40);
  });
});
