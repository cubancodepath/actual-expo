import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { applyMessages } from "@/core/sync/apply";
import { getClock } from "@/core/crdt";
import { runQuery, first } from "@/core/db";
import { SyncError } from "@/core/errors/SyncError";
import { Timestamp } from "@/core/crdt";

describe("applyMessages — atomic rollback (fix #2)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("leaves messages_crdt, messages_clock, and the in-memory merkle untouched when a batch fails mid-way", async () => {
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

    const merkleBefore = JSON.stringify(getClock().merkle);
    const countBefore = (
      await runQuery<{ c: number }>("SELECT COUNT(*) as c FROM messages_crdt")
    )[0].c;
    const clockRowBefore = await first<{ clock: string }>(
      "SELECT clock FROM messages_clock WHERE id = 1",
    );

    // A column that doesn't exist on `accounts` — the table write inside
    // the transaction throws, which must roll back the whole batch,
    // including the messages_crdt inserts and clock persistence for every
    // message in the same call (even ones before the bad one).
    await expect(
      applyMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc2",
          column: "name",
          value: "Savings",
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc2",
          column: "definitely_not_a_real_column",
          value: "x",
        },
      ]),
    ).rejects.toThrow(SyncError);

    const merkleAfter = JSON.stringify(getClock().merkle);
    const countAfter = (await runQuery<{ c: number }>("SELECT COUNT(*) as c FROM messages_crdt"))[0]
      .c;
    const clockRowAfter = await first<{ clock: string }>(
      "SELECT clock FROM messages_clock WHERE id = 1",
    );

    expect(merkleAfter).toBe(merkleBefore);
    expect(countAfter).toBe(countBefore);
    expect(clockRowAfter).toEqual(clockRowBefore);

    // The account created in the failed batch must not exist either.
    const acc2 = await runQuery("SELECT * FROM accounts WHERE id = 'acc2'");
    expect(acc2).toEqual([]);
  });
});
