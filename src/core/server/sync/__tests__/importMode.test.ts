import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { applyMessages } from "@/core/server/sync/apply";
import { setSyncingMode } from "@/core/server/sync/syncMode";
import { getClock } from "@/core/crdt";
import { Timestamp } from "@/core/crdt";
import { runQuery } from "@/core/server/db";
import { ActualError } from "@/core/errors/ActualError";

describe("applyMessages — import mode fast-path (Phase 3.4)", () => {
  afterEach(async () => {
    setSyncingMode("enabled");
    await closeTestDb();
  });

  it("inserts rows without touching messages_crdt or the merkle", async () => {
    await openTestDb();
    const merkleBefore = JSON.stringify(getClock().merkle);

    setSyncingMode("import");
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);

    const accounts = await runQuery<{ id: string; name: string }>("SELECT id, name FROM accounts");
    expect(accounts).toEqual([{ id: "acc1", name: "Checking" }]);

    const logged = await runQuery("SELECT * FROM messages_crdt");
    expect(logged).toEqual([]); // import mode never logs to messages_crdt
    expect(JSON.stringify(getClock().merkle)).toBe(merkleBefore); // merkle untouched
  });

  it("falls back to UPDATE when the row already exists (upsert)", async () => {
    await openTestDb();
    setSyncingMode("import");

    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Renamed",
      },
    ]);

    const accounts = await runQuery<{ id: string; name: string }>("SELECT id, name FROM accounts");
    expect(accounts).toEqual([{ id: "acc1", name: "Renamed" }]);
  });

  it("rejects prefs messages while importing", async () => {
    await openTestDb();
    setSyncingMode("import");

    await expect(
      applyMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "prefs",
          row: "budgetName",
          column: "value",
          value: "x",
        },
      ]),
    ).rejects.toThrow(ActualError);
  });

  it("import upsert keeps the second value when the same row+column is imported twice", async () => {
    await openTestDb();
    setSyncingMode("import");

    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "First",
      },
    ]);
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Second",
      },
    ]);

    const accounts = await runQuery<{ id: string; name: string }>("SELECT id, name FROM accounts");
    expect(accounts).toEqual([{ id: "acc1", name: "Second" }]);
  });

  it("import upsert inserts missing rows instead of silently dropping them", async () => {
    await openTestDb();
    setSyncingMode("import");

    // Before the fix, an UPDATE-only fallback path would silently no-op
    // when the row didn't already exist — this asserts the row is now
    // actually created by the upsert's INSERT branch.
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc-missing",
        column: "name",
        value: "Brand New",
      },
    ]);

    const accounts = await runQuery<{ id: string; name: string }>(
      "SELECT id, name FROM accounts WHERE id = ?",
      ["acc-missing"],
    );
    expect(accounts).toEqual([{ id: "acc-missing", name: "Brand New" }]);
  });

  it("does not affect the normal (enabled-mode) path once switched back", async () => {
    await openTestDb();
    setSyncingMode("import");
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);

    setSyncingMode("enabled");
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc2",
        column: "name",
        value: "Savings",
      },
    ]);

    const logged = await runQuery<{ dataset: string }>("SELECT dataset FROM messages_crdt");
    // Only the enabled-mode message was logged.
    expect(logged).toHaveLength(1);
  });
});
