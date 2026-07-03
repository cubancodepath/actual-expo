import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { applyMessages } from "@/core/sync/apply";
import { getClock, merkle, Timestamp } from "@/core/crdt";
import { runQuery } from "@/core/db";
import type { SyncMessage } from "@/core/sync/encoder";

// Fixed timestamps (not dependent on live clock state) so the same message
// set can be constructed identically for two independent "clients".
const ts = (millis: number, node: string) => new Timestamp(millis, 0, node);

function buildMessages(): SyncMessage[] {
  return [
    {
      timestamp: ts(1000, "aaaaaaaaaaaaaaaa"),
      dataset: "accounts",
      row: "acc1",
      column: "name",
      value: "Checking",
    },
    // custom_reports, banks, transaction_filters, reflect_budgets exist in
    // the schema but were previously omitted from the hand-maintained
    // ALLOWED_TABLES allow-list — regression coverage for fix #1.
    {
      timestamp: ts(2000, "aaaaaaaaaaaaaaaa"),
      dataset: "custom_reports",
      row: "rep1",
      column: "name",
      value: "My Report",
    },
    {
      timestamp: ts(3000, "bbbbbbbbbbbbbbbb"),
      dataset: "banks",
      row: "bank1",
      column: "name",
      value: "Chase",
    },
    {
      timestamp: ts(4000, "bbbbbbbbbbbbbbbb"),
      dataset: "transaction_filters",
      row: "f1",
      column: "name",
      value: "Big purchases",
    },
    {
      timestamp: ts(5000, "aaaaaaaaaaaaaaaa"),
      dataset: "reflect_budgets",
      row: "rb1",
      column: "amount",
      value: 500,
    },
    // A dataset this client genuinely has no table for (e.g. a future
    // schema addition on desktop) — must still fold into the merkle.
    {
      timestamp: ts(6000, "bbbbbbbbbbbbbbbb"),
      dataset: "future_table",
      row: "x1",
      column: "y",
      value: "z",
    },
  ];
}

describe("applyMessages — merkle convergence (fix #1)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("folds messages for unknown/unsupported datasets into messages_crdt and the merkle", async () => {
    await openTestDb();
    await applyMessages(buildMessages());

    const rows = await runQuery<{ dataset: string }>(
      "SELECT dataset FROM messages_crdt WHERE dataset = 'future_table'",
    );
    expect(rows).toHaveLength(1);
  });

  it("converges the merkle for two independent clients applying the same messages in different order", async () => {
    const messages = buildMessages();

    await openTestDb("client-a");
    await applyMessages(messages);
    const merkleA = getClock().merkle;
    const rowsA = await runQuery(
      "SELECT dataset, row, column, timestamp, value FROM messages_crdt ORDER BY timestamp",
    );
    await closeTestDb();

    await openTestDb("client-b");
    await applyMessages([...messages].reverse());
    const merkleB = getClock().merkle;
    const rowsB = await runQuery(
      "SELECT dataset, row, column, timestamp, value FROM messages_crdt ORDER BY timestamp",
    );

    expect(merkle.diff(merkleA, merkleB)).toBeNull();
    expect(rowsB).toEqual(rowsA);
  });

  it("still excludes internal bookkeeping tables from real SQL writes, even though they're folded into the merkle", async () => {
    await openTestDb();
    // "kvcache" is a real table, but internal — must never receive a
    // dataset-name-driven write, only the messages_crdt log entry.
    await applyMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "kvcache",
        row: "some-key",
        column: "value",
        value: "z",
      },
    ]);
    await expect(runQuery("SELECT * FROM kvcache")).resolves.toEqual([]);
    const logged = await runQuery<{ dataset: string }>(
      "SELECT dataset FROM messages_crdt WHERE dataset = 'kvcache'",
    );
    expect(logged).toHaveLength(1);
  });
});
