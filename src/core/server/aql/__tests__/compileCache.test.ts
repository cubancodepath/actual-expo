// The compile cache must be invisible: cached compilations return the same
// data as fresh ones, and caching never caches RESULTS (only sqlPieces/state).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run } from "@/core/server/db";
import { aqlQuery, __clearCompileCache, __getCompileCacheSize } from "@/core/server/aql";
import { q } from "@/core/shared/query";

async function seed() {
  await run("INSERT INTO accounts (id, name, offbudget, tombstone) VALUES (?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Amazon", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);
  await run(
    "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
    ["t1", "acc1", "p1", -1500, 20240115, 0, 0, 0],
  );
}

describe("AQL compile cache", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
    __clearCompileCache();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("compiles a repeated query shape once", async () => {
    const query = () => q("transactions").select(["id", "amount"]);

    const first = await aqlQuery<Array<{ id: string }>>(query());
    const second = await aqlQuery<Array<{ id: string }>>(query());

    expect(second.data).toEqual(first.data);
    expect(second.dependencies).toEqual(first.dependencies);
    expect(__getCompileCacheSize()).toBe(1);
  });

  it("caches distinct query shapes separately", async () => {
    await aqlQuery(q("transactions").select(["id"]));
    await aqlQuery(q("transactions").select(["id", "amount"]));
    await aqlQuery(q("accounts").select(["id"]));

    expect(__getCompileCacheSize()).toBe(3);
  });

  it("reuses the compilation but never the results", async () => {
    const query = () => q("transactions").select(["id"]);

    const before = await aqlQuery<Array<{ id: string }>>(query());
    expect(before.data).toHaveLength(1);

    await run(
      "INSERT INTO transactions (id, acct, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?)",
      ["t2", "acc1", "p1", 5000, 20240220, 0, 0, 0],
    );

    const after = await aqlQuery<Array<{ id: string }>>(query());
    expect(after.data).toHaveLength(2);
    expect(__getCompileCacheSize()).toBe(1);
  });

  it("binds parameters at run time, not compile time", async () => {
    const query = () =>
      q("transactions")
        .filter({ amount: { $lt: ":limit" } })
        .select(["id"]);

    const strict = await aqlQuery<Array<{ id: string }>>(query(), { limit: -2000 });
    const loose = await aqlQuery<Array<{ id: string }>>(query(), { limit: -1000 });

    expect(strict.data).toHaveLength(0);
    expect(loose.data).toHaveLength(1);
    expect(__getCompileCacheSize()).toBe(1);
  });
});
