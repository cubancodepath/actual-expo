// Parity test for the queries the app runs at budget open + on the main
// screens. The `tags`-not-in-schema crash that bounced users back to the budget
// picker slipped through because no test ran the bootstrap queries against a
// real DB. This runs them (and the transaction/search/schedule shapes) against
// better-sqlite3 so that class of regression fails loudly here.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { run } from "@/core/server/db";
import { executeQuery } from "@/core/server/aql/execute";
import { q } from "@/core/shared/query";
import { getTags } from "@/core/server/tags";
import { buildSearchQuery } from "@/screens/transactions/SearchScreen/searchParams";
import { buildTransactionsListQuery } from "@/screens/transactions/TransactionsListScreen/hooks/useTransactionsListQuery";

async function seed() {
  await run("INSERT INTO accounts (id, name, offbudget, closed, tombstone) VALUES (?,?,?,?,?)", [
    "acc1",
    "Checking",
    0,
    0,
    0,
  ]);
  await run("INSERT INTO categories (id, name, cat_group, tombstone) VALUES (?,?,?,?)", [
    "c1",
    "Food",
    "g1",
    0,
  ]);
  await run("INSERT INTO category_groups (id, name, tombstone) VALUES (?,?,?)", [
    "g1",
    "Expenses",
    0,
  ]);
  await run("INSERT INTO payees (id, name, tombstone) VALUES (?,?,?)", ["p1", "Amazon", 0]);
  await run("INSERT INTO payee_mapping (id, targetId) VALUES (?,?)", ["p1", "p1"]);
  await run("INSERT INTO category_mapping (id, transferId) VALUES (?,?)", ["c1", "c1"]);
  await run("INSERT INTO tags (id, tag, color, tombstone) VALUES (?,?,?,?)", [
    "t1",
    "trip",
    null,
    0,
  ]);
  await run(
    "INSERT INTO transactions (id, acct, category, description, amount, date, tombstone, isParent, isChild) VALUES (?,?,?,?,?,?,?,?,?)",
    ["tx1", "acc1", "c1", "p1", -1500, 20240115, 0, 0, 0],
  );
}

describe("bootstrap + screen query parity (real DB)", () => {
  beforeEach(async () => {
    await openTestDb();
    await seed();
  });
  afterEach(async () => {
    await closeTestDb();
  });

  it("runs every loadBudget pre-fetch query without throwing", async () => {
    await expect(executeQuery(q("accounts"))).resolves.toBeDefined();
    await expect(executeQuery(q("categories"))).resolves.toBeDefined();
    await expect(executeQuery(q("category_groups"))).resolves.toBeDefined();
    await expect(executeQuery(q("payees"))).resolves.toBeDefined();
    // Balance + group total (calculate + $oneof)
    await expect(
      executeQuery(q("transactions").filter({ account: "acc1" }).calculate({ $sum: "$amount" })),
    ).resolves.toBeDefined();
    await expect(
      executeQuery(
        q("transactions")
          .filter({ account: { $oneof: ["acc1"] } })
          .calculate({ $sum: "$amount" }),
      ),
    ).resolves.toBeDefined();
  });

  it("categories expose the upstream `group` field", async () => {
    const { data } = await executeQuery<Record<string, unknown>>(q("categories"));
    const c1 = data.find((r) => r.id === "c1")!;
    expect(c1.group).toBe("g1");
  });

  it("tags come from the raw-SQL server domain (not AQL)", async () => {
    const tags = await getTags();
    expect(tags.map((t) => t.tag)).toContain("trip");
  });

  it("compiles + runs the transaction-list and search query shapes", async () => {
    await expect(
      executeQuery(buildTransactionsListQuery({ kind: "account", accountId: "acc1" }, "2024-01")),
    ).resolves.toBeDefined();
    await expect(
      executeQuery(buildTransactionsListQuery({ kind: "category", categoryId: "c1" }, "2024-01")),
    ).resolves.toBeDefined();
    await expect(
      executeQuery(buildSearchQuery({ text: "amaz", uncategorized: true })),
    ).resolves.toBeDefined();
  });

  it("selects schedules + rules without throwing (view-backed)", async () => {
    await expect(executeQuery(q("schedules").select(["*"]))).resolves.toBeDefined();
    await expect(
      executeQuery(
        q("rules").filter({ $and: [{ conditions: { $ne: null } }, { actions: { $ne: null } }] }),
      ),
    ).resolves.toBeDefined();
  });
});
