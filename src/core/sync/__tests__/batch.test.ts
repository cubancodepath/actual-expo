import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { sendMessages, batchMessages, resetBatchState } from "@/core/sync/batch";
import { runQuery } from "@/core/db";
import { Timestamp } from "@/core/crdt";

describe("batchMessages — nested re-entrancy (fix #4)", () => {
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("applies messages from a nested batchMessages call together with the outer batch, in one apply", async () => {
    await openTestDb();

    await batchMessages(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc1",
          column: "name",
          value: "Outer",
        },
      ]);

      // Nested call: must NOT flush the outer buffer early or drop batching
      // mode for the rest of the outer callback.
      await batchMessages(async () => {
        await sendMessages([
          {
            timestamp: Timestamp.send()!,
            dataset: "accounts",
            row: "acc2",
            column: "name",
            value: "Inner",
          },
        ]);
      });

      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc3",
          column: "name",
          value: "Outer again",
        },
      ]);

      // While still inside the outer batch, nothing should have hit the DB yet.
      const rowsMidway = await runQuery("SELECT id FROM accounts");
      expect(rowsMidway).toEqual([]);
    });

    const rows = await runQuery<{ id: string }>("SELECT id FROM accounts ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(["acc1", "acc2", "acc3"]);
  });
});
