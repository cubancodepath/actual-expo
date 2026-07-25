import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/server/db/__tests__/testDb";
import { applyMessages } from "@/core/server/sync/apply";
import { runQuery, first } from "@/core/server/db";
import { Timestamp } from "@/core/crdt";

// Column allowlist (plan 003): the `column` field of a CRDT sync message is
// attacker-controlled (comes straight off the wire from encoder.ts with no
// validation) and was previously spliced raw into SQL. These tests cover the
// per-table column allowlist added to apply.ts's applyMessages, mirroring
// the existing unknown-dataset regression tests in apply.test.ts.
describe("applyMessages — column allowlist", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("applies a message with a valid dataset+column (row updated)", async () => {
    await openTestDb();

    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Checking",
      },
    ]);

    const row = await first<{ name: string }>("SELECT name FROM accounts WHERE id = 'acc1'");
    expect(row?.name).toBe("Checking");
  });

  it("does not write, does not throw, and still records in messages_crdt for a column that does not exist on an otherwise-valid table", async () => {
    await openTestDb();

    // Simulate an attacker/compromised-server-controlled column identifier —
    // punctuation/space typical of an injected SQL fragment. Any non-column
    // string suffices; this must never reach the SQL layer.
    const badColumn = "name); DROP TABLE accounts; --";

    await expect(
      applyMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc1",
          column: badColumn,
          value: "Checking",
        },
      ]),
    ).resolves.not.toThrow();

    // The table must be untouched — no row created, no column added.
    const rows = await runQuery("SELECT * FROM accounts WHERE id = 'acc1'");
    expect(rows).toEqual([]);

    // The message must still be recorded for CRDT/merkle convergence.
    const logged = await runQuery<{ c: number }>(
      "SELECT COUNT(*) as c FROM messages_crdt WHERE dataset = 'accounts' AND column = ?",
      [badColumn],
    );
    expect(logged[0].c).toBe(1);
  });

  it("behaves as before (regression) for a dataset not in writable tables, regardless of column", async () => {
    await openTestDb();

    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "not_a_real_table",
        row: "x1",
        column: "whatever",
        value: "z",
      },
    ]);

    const logged = await runQuery<{ c: number }>(
      "SELECT COUNT(*) as c FROM messages_crdt WHERE dataset = 'not_a_real_table'",
    );
    expect(logged[0].c).toBe(1);
  });
});
