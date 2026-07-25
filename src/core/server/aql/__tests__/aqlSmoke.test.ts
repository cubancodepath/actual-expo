// End-to-end smoke test for the ported AQL: compiler + views-at-init + exec +
// expo dialect, running against the better-sqlite3 node adapter. This is the
// first place the @ts-nocheck verbatim compiler meets a real DB.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run, runQuery } from "@/core/server/db";
import { aqlQuery, getQueryDependencies } from "@/core/server/aql";
import { q } from "@/core/shared/query";
import type { Query } from "@/core/shared/query";

type Row = Record<string, unknown>;

async function rows(query: Query): Promise<Row[]> {
  const { data } = await aqlQuery(query);
  return data as Row[];
}

async function scalar(query: Query): Promise<unknown> {
  const { data } = await aqlQuery(query);
  return data;
}

async function seed() {
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Amazon", 0]);
  // The app maintains a self-row in payee_mapping/category_mapping for every
  // payee/category; the transactions view resolves payee via payee_mapping.
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);
  await run(
    "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
    ["t1", "acc1", "p1", -1500, 20240115, 0, 0, 0],
  );
  await run(
    "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
    ["t2", "acc1", "p1", 5000, 20240220, 0, 0, 0],
  );
}

describe("AQL port — end-to-end", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("creates the AQL views at init", async () => {
    const views = await runQuery<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name",
    );
    const names = views.map((v) => v.name);
    expect(names).toContain("v_transactions");
    expect(names).toContain("v_transactions_internal");
    expect(names).toContain("v_payees");
    expect(names).toContain("v_categories");
    expect(names).toContain("v_schedules");
  });

  it("selects transactions with upstream field names + string dates", async () => {
    const data = await rows(
      q("transactions").filter({ account: "acc1" }).select(["id", "amount", "date", "account"]),
    );
    expect(data.length).toBe(2);
    const t1 = data.find((r) => r.id === "t1")!;
    // date is converted to a YYYY-MM-DD string (faithful output typing)
    expect(t1.date).toBe("2024-01-15");
    expect(t1.amount).toBe(-1500);
    expect(t1.account).toBe("acc1");
  });

  it("reaches through a ref-path (payee.name) via JOIN", async () => {
    const data = await rows(q("transactions").filter({ "payee.name": "Amazon" }).select(["id"]));
    expect(data.length).toBe(2);
  });

  it("unwraps .calculate() to a scalar", async () => {
    const total = await scalar(
      q("transactions").filter({ account: "acc1" }).calculate({ $sum: "$amount" }),
    );
    expect(total).toBe(3500);
  });

  it("$like uses the expo dialect (plain LIKE)", async () => {
    const data = await rows(
      q("transactions")
        .filter({ "payee.name": { $like: "%mazon%" } })
        .select(["id"]),
    );
    expect(data.length).toBe(2);
  });

  it("selects display names via ref-paths (payee.name / account.name)", async () => {
    const data = await rows(
      q("transactions")
        .filter({ account: "acc1" })
        .select(["id", { payeeName: "payee.name" }, { accountName: "account.name" }]),
    );
    const t1 = data.find((r) => r.id === "t1")!;
    expect(t1.payeeName).toBe("Amazon");
    expect(t1.accountName).toBe("Checking");
  });

  it("filters on a multi-hop ref-path (payee.transfer_acct.offbudget)", async () => {
    // Non-transfer payee → transfer_acct is null; the searchParams uncategorized
    // filter form must compile + run against the real DB.
    const data = await rows(
      q("transactions")
        .filter({
          $or: [{ "payee.transfer_acct": null }, { "payee.transfer_acct.offbudget": true }],
        })
        .select(["id"]),
    );
    expect(data.length).toBe(2);
  });

  it("getQueryDependencies reports joined tables", () => {
    const deps = getQueryDependencies(
      q("transactions").filter({ "payee.name": "Amazon" }).select(["id"]),
    );
    expect(deps).toContain("transactions");
    expect(deps).toContain("payees");
  });
});
