import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { applyMessages } from "@/core/sync/apply";
import { getClock } from "@/core/crdt";
import { runQuery, first } from "@/core/db";
import { ActualError } from "@/core/errors/ActualError";
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

    // A genuine SQL constraint violation on a real, allowlisted column — the
    // first message inserts acc2, the second updates acc2's id to acc1's id
    // (a real PRIMARY KEY collision, since acc1 already exists from the setup
    // call above). This throws at the SQL layer, which must roll back the
    // whole batch, including the messages_crdt inserts and clock persistence
    // for every message in the same call (even ones before the bad one).
    // (Previously this used an unknown/non-existent column name as the throw
    // trigger; the column allowlist now intercepts unknown columns before
    // they reach SQL, so the trigger must be a real failure instead.)
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
          column: "id",
          value: "acc1",
        },
      ]),
    ).rejects.toThrow(ActualError);

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
