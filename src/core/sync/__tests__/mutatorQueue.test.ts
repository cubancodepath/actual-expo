import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first } from "@/core/db";
import { sendMessages, batchMessages, resetBatchState } from "@/core/sync/batch";
import { undo, canUndo, clearUndo, undoable } from "@/core/sync/undo";
import { listen, type SyncEvent } from "@/core/sync/syncEvents";
import { Timestamp } from "@/core/crdt";

/**
 * Interleaving tests for the mutator queue (plan 009). These prove that
 * concurrent top-level mutation flows — sendMessages, batchMessages,
 * undoable mutations — are FIFO-serialized through `runMutator` instead of
 * sharing the module-global batching/undo flags across flows. See
 * plans/009-serialize-mutation-pipeline.md.
 *
 * Test 1 is "the bug": before this plan (batch.ts/undo.ts pre-runMutator),
 * a standalone sendMessages() fired while a batchMessages() body is
 * suspended at an internal await gets silently swept into that batch,
 * because both shared the same `_isBatching` flag with no queue between
 * them. Reverting the batch.ts/undo.ts changes from this commit (keeping
 * this test file) reproduces that failure.
 */

describe("mutator queue — interleaving", () => {
  afterEach(async () => {
    resetBatchState();
    clearUndo();
    await closeTestDb();
  });

  it("1. THE BUG: a standalone sendMessages fired while batchMessages is suspended does NOT get swept into that batch", async () => {
    await openTestDb();

    let resolveDeferred!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveDeferred = resolve;
    });

    const appliedEvents: SyncEvent[] = [];
    const unlisten = listen((e) => {
      if (e.type === "applied") appliedEvents.push(e);
    });

    // Start A: a batch whose body suspends on a deferred promise mid-flight.
    const aPromise = batchMessages(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "accA",
          column: "name",
          value: "A",
        },
      ]);
      await deferred;
    });

    // Fire B — a standalone sendMessages, NOT awaited-chained to A in any way.
    const bPromise = sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "accB",
        column: "name",
        value: "B",
      },
    ]);

    resolveDeferred();
    await aPromise;
    await bPromise;
    unlisten();

    // Both rows exist — nothing was lost.
    const accA = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["accA"]);
    const accB = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["accB"]);
    expect(accA?.name).toBe("A");
    expect(accB?.name).toBe("B");

    // B applied as its OWN separate "applied" event — NOT folded into A's
    // single batch flush. Before this plan: only ONE "accounts" apply event
    // fires (B's message silently merged into A's `_batched` buffer).
    const accountsApplies = appliedEvents.filter(
      (e) => "tables" in e && e.tables.includes("accounts"),
    );
    expect(accountsApplies).toHaveLength(2);
  });

  it("2. two concurrent batchMessages calls apply strictly FIFO, each as its own applied event", async () => {
    await openTestDb();

    const order: string[] = [];
    const appliedEvents: SyncEvent[] = [];
    const unlisten = listen((e) => {
      if (e.type === "applied") appliedEvents.push(e);
    });

    const p1 = batchMessages(async () => {
      order.push("start1");
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc1",
          column: "name",
          value: "One",
        },
      ]);
      order.push("end1");
    });
    // Fired immediately after p1, NOT awaited in between.
    const p2 = batchMessages(async () => {
      order.push("start2");
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc2",
          column: "name",
          value: "Two",
        },
      ]);
      order.push("end2");
    });

    await p1;
    await p2;
    unlisten();

    // Strict FIFO: call 2's body does not start until call 1's has fully finished.
    expect(order).toEqual(["start1", "end1", "start2", "end2"]);

    const acc1 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    const acc2 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc2"]);
    expect(acc1?.name).toBe("One");
    expect(acc2?.name).toBe("Two");

    const accountsApplies = appliedEvents.filter(
      (e) => "tables" in e && e.tables.includes("accounts"),
    );
    expect(accountsApplies).toHaveLength(2);
  });

  it("3. concurrent undoable mutations form two distinct undo groups; two undo() calls restore both, most-recent first", async () => {
    await openTestDb();
    clearUndo();

    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });

    // Fired back-to-back, NOT awaited in between — this is exactly the
    // cross-flow race that used to merge both into a single undo group.
    const p1 = setName("acc1", "First");
    const p2 = setName("acc2", "Second");
    await p1;
    await p2;

    expect(canUndo()).toBe(true);

    await undo(); // reverses the most recent group only (acc2)
    const acc2AfterFirstUndo = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc2"],
    );
    const acc1AfterFirstUndo = await first<{ name: string; tombstone: number }>(
      "SELECT name, tombstone FROM accounts WHERE id = ?",
      ["acc1"],
    );
    expect(acc2AfterFirstUndo?.tombstone).toBe(1);
    expect(acc1AfterFirstUndo?.tombstone).toBe(0); // untouched by the first undo
    expect(acc1AfterFirstUndo?.name).toBe("First");
    expect(canUndo()).toBe(true); // acc1's group still pending

    await undo(); // reverses acc1's group
    const acc1AfterSecondUndo = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc1"],
    );
    expect(acc1AfterSecondUndo?.tombstone).toBe(1);
    expect(canUndo()).toBe(false);
  });

  it("4. a rejecting queued mutation does not block the next one", async () => {
    await openTestDb();
    const boom = new Error("boom");

    const p1 = batchMessages(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "willfail",
          column: "name",
          value: "X",
        },
      ]);
      throw boom;
    });

    // Queued immediately behind p1 — must not hang waiting for p1's failure
    // to somehow poison the queue.
    const p2 = sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc2",
        column: "name",
        value: "Two",
      },
    ]);

    await expect(p1).rejects.toThrow(boom);
    await p2; // must resolve, not hang

    // p1's batch applied nothing — a failed batch discards its buffer.
    const willFailRow = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", [
      "willfail",
    ]);
    expect(willFailRow).toBeNull();

    // p2 still succeeded despite running immediately after a rejection.
    const acc2 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc2"]);
    expect(acc2?.name).toBe("Two");
  });
});
