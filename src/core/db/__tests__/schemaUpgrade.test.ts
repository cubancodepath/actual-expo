import { describe, it, expect } from "vitest";
import { openDatabaseAsync } from "expo-sqlite";
import { runSchema } from "@/core/db/schema";

describe("runSchema — idempotent column upgrades for existing installs (fix #16)", () => {
  it("adds new columns via ALTER TABLE to a pre-existing table that predates them, without touching existing rows", async () => {
    const db = await openDatabaseAsync("db.sqlite", {}, "schema-upgrade-test");

    // Simulate a legacy install: an `accounts` table from before
    // bank_sync_status existed, already holding data.
    await db.execAsync(`
      CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT);
      INSERT INTO accounts (id, name) VALUES ('acc1', 'Checking');
    `);

    await runSchema(db);

    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(accounts)");
    expect(cols.some((c) => c.name === "bank_sync_status")).toBe(true);

    const rows = await db.getAllAsync<{ id: string; name: string }>(
      "SELECT id, name FROM accounts",
    );
    expect(rows).toEqual([{ id: "acc1", name: "Checking" }]);
  });

  it("is a no-op the second time it runs (column already present)", async () => {
    const db = await openDatabaseAsync("db.sqlite", {}, "schema-upgrade-test-2");
    await runSchema(db);
    await expect(runSchema(db)).resolves.not.toThrow();

    const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(tags)");
    expect(cols.filter((c) => c.name === "hidden")).toHaveLength(1);
  });
});
