// formulaSpreadsheet against the real formula engine + AQL compiler. Covers the
// DB-free evaluation path (math / string / errors) and the QUERY / QUERY_COUNT
// prefetch path that runs real AQL queries over seeded transactions.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { formulaSpreadsheet, type FormulaData, type QueriesMap } from "../formula-spreadsheet";

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

async function collect(formula: string, queries: QueriesMap = {}): Promise<FormulaData> {
  let captured: FormulaData | undefined;
  await formulaSpreadsheet(
    formula,
    queries,
  )((d) => {
    captured = d;
  });
  return captured!;
}

describe("formulaSpreadsheet", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("evaluates a pure-math formula with built-ins", async () => {
    expect(await collect("=SUM(1, 2, 3)")).toEqual({ result: 6, error: null });
    expect(await collect("=10 * 5 + 2")).toEqual({ result: 52, error: null });
  });

  it("returns a string result verbatim", async () => {
    expect(await collect('=CONCATENATE("a", "b")')).toEqual({ result: "ab", error: null });
  });

  it("rejects a formula that does not start with =", async () => {
    const data = await collect("SUM(1)");
    expect(data.result).toBeNull();
    expect(data.error).toMatch(/must start with =/);
  });

  it("surfaces an engine error (unknown function)", async () => {
    const data = await collect("=NOPE(1)");
    expect(data.result).toBeNull();
    expect(data.error).toMatch(/Formula error/);
  });

  it("resolves QUERY as the summed amount in dollars", async () => {
    // 10000 - 4000 - 2000 = 4000 cents → integerToAmount → 40.
    const queries: QueriesMap = { net: { conditions: [], conditionsOp: "and" } };
    expect(await collect('=QUERY("net")', queries)).toEqual({ result: 40, error: null });
  });

  it("resolves QUERY_COUNT and composes with QUERY", async () => {
    const queries: QueriesMap = { net: { conditions: [], conditionsOp: "and" } };
    expect(await collect('=QUERY_COUNT("net")', queries)).toEqual({ result: 3, error: null });
    expect(await collect('=QUERY("net") + QUERY_COUNT("net")', queries)).toEqual({
      result: 43,
      error: null,
    });
  });

  it("applies a query's conditions to the sum", async () => {
    // Only positive amounts → 10000 cents → 100 dollars.
    const queries: QueriesMap = {
      inflow: { conditions: [{ field: "amount", op: "gt", value: 0 }], conditionsOp: "and" },
    };
    expect(await collect('=QUERY("inflow")', queries)).toEqual({ result: 100, error: null });
  });
});
