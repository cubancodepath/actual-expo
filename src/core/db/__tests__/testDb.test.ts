import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "./testDb";
import { run, runQuery, runQuerySync } from "@/core/db";
import { getClock } from "@/core/crdt";

describe("testDb harness (real SQLite via better-sqlite3)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("runs the real schema and supports insert/read", async () => {
    await openTestDb();

    await run("INSERT INTO categories (id, name) VALUES (?, ?)", ["cat1", "Groceries"]);
    const rows = await runQuery<{ id: string; name: string }>(
      "SELECT id, name FROM categories WHERE id = ?",
      ["cat1"],
    );

    expect(rows).toEqual([{ id: "cat1", name: "Groceries" }]);
  });

  it("supports synchronous queries", async () => {
    await openTestDb();
    await run("INSERT INTO categories (id, name) VALUES (?, ?)", ["cat2", "Rent"]);
    const rows = runQuerySync<{ id: string }>("SELECT id FROM categories WHERE id = ?", ["cat2"]);
    expect(rows).toEqual([{ id: "cat2" }]);
  });

  it("initializes a fresh CRDT clock", async () => {
    await openTestDb();
    const clock = getClock();
    expect(clock).toBeTruthy();
    expect(clock.merkle).toBeDefined();
  });

  it("gives independent databases to independent directories", async () => {
    await openTestDb("client-a");
    await run("INSERT INTO categories (id, name) VALUES (?, ?)", ["only-in-a", "A"]);
    await closeTestDb();

    await openTestDb("client-b");
    const rows = await runQuery("SELECT id FROM categories WHERE id = ?", ["only-in-a"]);
    expect(rows).toEqual([]);
  });
});
