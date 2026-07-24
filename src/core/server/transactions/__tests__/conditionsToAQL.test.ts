// Faithful-port checks for `conditionsToAQL`: a representative subset of
// upstream loot-core transaction-rules tests, run against the real AQL compiler
// + expo-sqlite dialect (better-sqlite3 node adapter). Also pins the two seams
// that diverge from upstream: string dates and the unsupported REGEXP function.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { run } from "@/core/db";
import { aqlQuery, RegexpUnsupportedError } from "@/core/server/aql";
import { q } from "@/core/shared/query";
import type { RuleCondition } from "@/core/types/models";
import { conditionsToAQL } from "../transaction-rules";

type Row = Record<string, unknown>;

async function getMatchingIds(conds: RuleCondition[]): Promise<string[]> {
  const { filters } = conditionsToAQL(conds);
  const { data } = await aqlQuery(q("transactions").filter({ $and: filters }).select("*"));
  return (data as Row[]).map((r) => r.id as string).sort();
}

async function seed() {
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
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Amazon", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);

  const tx = (id: string, acct: string, amount: number, date: number, notes: string) =>
    run(
      "INSERT INTO transactions (id, acct, description, amount, date, notes, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
      [id, acct, "p1", amount, date, notes, 0, 0, 0],
    );

  await tx("t1", "acc1", -1500, 20240115, "Amazon order #Tag_1 issue");
  await tx("t2", "acc1", 5000, 20240220, "salary");
  await tx("t3", "acc2", -300, 20240115, "Savings fee");
}

describe("conditionsToAQL — faithful port", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("number `is` matches the exact amount", async () => {
    expect(await getMatchingIds([{ field: "amount", op: "is", value: 5000 }])).toEqual(["t2"]);
  });

  it("number `isapprox` matches within the 7.5% threshold", async () => {
    // threshold(5000) = round(5000 * 0.075) = 375 → [4625, 5375]
    expect(await getMatchingIds([{ field: "amount", op: "isapprox", value: 5000 }])).toEqual([
      "t2",
    ]);
  });

  it("date `is` with a month value bounds the range (string dates)", async () => {
    expect(await getMatchingIds([{ field: "date", op: "is", value: "2024-01" }])).toEqual([
      "t1",
      "t3",
    ]);
  });

  it("date `is` with a full date matches that day", async () => {
    expect(await getMatchingIds([{ field: "date", op: "is", value: "2024-01-15" }])).toEqual([
      "t1",
      "t3",
    ]);
  });

  it("string `contains` lower-cases both sides", async () => {
    expect(await getMatchingIds([{ field: "notes", op: "contains", value: "amazon" }])).toEqual([
      "t1",
    ]);
  });

  it("`oneOf` on an id field matches any listed value", async () => {
    expect(await getMatchingIds([{ field: "account", op: "oneOf", value: ["acc1"] }])).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("`offBudget` / `onBudget` reach through account.offbudget", async () => {
    expect(await getMatchingIds([{ field: "account", op: "offBudget", value: null }])).toEqual([
      "t3",
    ]);
    expect(await getMatchingIds([{ field: "account", op: "onBudget", value: null }])).toEqual([
      "t1",
      "t2",
    ]);
  });

  it("`is category null` fans out to exclude transfers and parents", () => {
    const { filters } = conditionsToAQL([{ field: "category", op: "is", value: null }]);
    expect(filters).toStrictEqual([
      {
        $and: [
          { category: { $eq: null } },
          { transfer_id: { $eq: null } },
          { is_parent: { $eq: false } },
        ],
      },
    ]);
  });

  it("emits $regexp for hasAnyTag; the expo dialect rejects it at run time", async () => {
    // Faithful compile — the seam is at execution: expo-sqlite can't register
    // REGEXP, so the query throws (widgets catch this and fall back).
    const { filters } = conditionsToAQL([{ field: "notes", op: "hasAnyTag", value: "#Tag_1" }]);
    expect(JSON.stringify(filters)).toContain("$regexp");
    await expect(
      aqlQuery(q("transactions").filter({ $and: filters }).select("*")),
    ).rejects.toBeInstanceOf(RegexpUnsupportedError);
  });
});
