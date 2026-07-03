import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { applyMessages, getMessagesSince } from "@/core/sync/apply";
import { serializeValue } from "@/core/sync/values";
import { Timestamp } from "@/core/crdt";
import { runQuery } from "@/core/db";

describe("getMessagesSince — value round-trip (fix #8)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("returns the exact stored wire-serialized string, byte-for-byte, for edge-case numbers and strings", async () => {
    await openTestDb();

    const values: (string | number | null)[] = [
      1.1,
      1e21,
      0.30000000000000004,
      -0,
      "",
      "hello world",
      null,
    ];

    const messages = values.map((value, i) => ({
      timestamp: Timestamp.send()!,
      dataset: "notes",
      row: `row${i}`,
      column: "note",
      value,
    }));

    await applyMessages(messages);

    const stored = await runQuery<{ row: string; value: string }>(
      "SELECT row, value FROM messages_crdt ORDER BY row",
    );
    const outgoing = await getMessagesSince(Timestamp.zero.toString());

    for (let i = 0; i < values.length; i++) {
      const expectedWire = serializeValue(values[i]);
      const storedRow = stored.find((r) => r.row === `row${i}`);
      const outgoingRow = outgoing.find((m) => m.row === `row${i}`);

      expect(storedRow?.value).toBe(expectedWire);
      expect(outgoingRow?.value).toBe(expectedWire);
      // The critical assertion: outgoing value equals the stored value
      // verbatim — no deserialize→re-serialize transformation in between.
      expect(outgoingRow?.value).toBe(storedRow?.value);
    }
  });
});
