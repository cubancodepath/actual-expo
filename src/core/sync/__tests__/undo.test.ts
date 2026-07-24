import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first, runQuery } from "@/core/db";
import { sendMessages, batchMessages } from "@/core/sync/batch";
import { resetBatchState } from "@/core/sync/batch";
import { Timestamp } from "@/core/crdt";
import { undoable, undo, canUndo, clearUndo } from "@/core/sync/undo";

/**
 * Tests for the undo system (src/core/sync/undo.ts), plan 003. Pins CURRENT
 * behavior — see plans/003-undo-tests.md. No redo exists; do not test redo.
 */

describe("undo — basic round-trip", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("undoable-wrapped update reverses via NEW CRDT messages (fresh timestamps), not a log rollback", async () => {
    await openTestDb();
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "accounts",
        row: "acc1",
        column: "name",
        value: "Original",
      },
    ]);

    const updateName = undoable(async (name: string) => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "acc1",
          column: "name",
          value: name,
        },
      ]);
    });
    await updateName("Changed");

    let row = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    expect(row?.name).toBe("Changed");

    const crdtCountBefore = (
      await runQuery<{ c: number }>(
        "SELECT COUNT(*) as c FROM messages_crdt WHERE dataset = 'accounts' AND row = 'acc1' AND column = 'name'",
      )
    )[0].c;

    const tables = await undo();
    expect(tables).toContain("accounts");

    row = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    expect(row?.name).toBe("Original");

    // A NEW message was written (fresh timestamp), not a rollback of the log
    const crdtCountAfter = (
      await runQuery<{ c: number }>(
        "SELECT COUNT(*) as c FROM messages_crdt WHERE dataset = 'accounts' AND row = 'acc1' AND column = 'name'",
      )
    )[0].c;
    expect(crdtCountAfter).toBe(crdtCountBefore + 1);
  });
});

describe("undo — creation reversal", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("undoable creation (no oldData) → undo() tombstones the row", async () => {
    await openTestDb();
    const createAcc = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "newacc",
          column: "name",
          value: "Fresh",
        },
      ]);
    });
    await createAcc();

    let row = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "newacc",
    ]);
    expect(row?.tombstone).toBe(0);

    await undo();

    row = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "newacc",
    ]);
    expect(row?.tombstone).toBe(1);
  });

  it("notes creation reverts the note value to null", async () => {
    await openTestDb();
    const createNote = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "notes",
          row: "cat1",
          column: "note",
          value: "hello",
        },
      ]);
    });
    await createNote();

    let row = await first<{ note: string | null }>("SELECT note FROM notes WHERE id = ?", ["cat1"]);
    expect(row?.note).toBe("hello");

    await undo();

    row = await first<{ note: string | null }>("SELECT note FROM notes WHERE id = ?", ["cat1"]);
    expect(row?.note).toBeNull();
  });

  it("zero_budgets.amount creation reverts to 0", async () => {
    await openTestDb();
    const setBudget = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "zero_budgets",
          row: "zb1",
          column: "amount",
          value: 5000,
        },
      ]);
    });
    await setBudget();

    let row = await first<{ amount: number }>("SELECT amount FROM zero_budgets WHERE id = ?", [
      "zb1",
    ]);
    expect(row?.amount).toBe(5000);

    await undo();

    row = await first<{ amount: number }>("SELECT amount FROM zero_budgets WHERE id = ?", ["zb1"]);
    expect(row?.amount).toBe(0);
  });

  it("reflect_budgets.amount creation reverts to 0, not tombstone (tracking budget)", async () => {
    await openTestDb();
    const setBudget = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "reflect_budgets",
          row: "rb1",
          column: "amount",
          value: 7000,
        },
      ]);
    });
    await setBudget();

    let row = await first<{ amount: number }>("SELECT amount FROM reflect_budgets WHERE id = ?", [
      "rb1",
    ]);
    expect(row?.amount).toBe(7000);

    await undo();

    row = await first<{ amount: number }>("SELECT amount FROM reflect_budgets WHERE id = ?", [
      "rb1",
    ]);
    expect(row?.amount).toBe(0);
  });

  it("category_mapping creation is NOT reversed (mapping row survives undo)", async () => {
    await openTestDb();
    const mapCategory = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "category_mapping",
          row: "cat1",
          column: "transferId",
          value: "cat1",
        },
      ]);
    });
    await mapCategory();

    let row = await first<{ transferId: string }>(
      "SELECT transferId FROM category_mapping WHERE id = ?",
      ["cat1"],
    );
    expect(row?.transferId).toBe("cat1");

    const before = canUndo();
    expect(before).toBe(true);

    await undo();

    // The mapping row is untouched — undoMessage() returns null for
    // category_mapping/payee_mapping creations, so no reversing message is
    // ever generated for them.
    row = await first<{ transferId: string }>(
      "SELECT transferId FROM category_mapping WHERE id = ?",
      ["cat1"],
    );
    expect(row?.transferId).toBe("cat1");
  });
});

describe("undo — markers and grouping", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("two sequential undoable ops: first undo() reverses only the second, second undo() reverses the first", async () => {
    await openTestDb();
    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });

    await setName("acc1", "First");
    await setName("acc2", "Second");

    let acc1 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    let acc2 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc2"]);
    expect(acc1?.name).toBe("First");
    expect(acc2?.name).toBe("Second");

    await undo(); // reverses the SECOND op only (acc2's creation → tombstoned)
    acc1 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    let acc2Row = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc2"],
    );
    expect(acc1?.name).toBe("First"); // untouched
    expect(acc2Row?.tombstone).toBe(1); // reversed (row was created by op 2)

    await undo(); // reverses the FIRST op
    const acc1Row = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc1"],
    );
    expect(acc1Row?.tombstone).toBe(1);
  });

  it("canUndo() transitions true -> false at the bottom of the history", async () => {
    await openTestDb();
    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });

    expect(canUndo()).toBe(false);
    await setName("acc1", "First");
    expect(canUndo()).toBe(true);
    await setName("acc2", "Second");
    expect(canUndo()).toBe(true);

    await undo();
    expect(canUndo()).toBe(true);
    await undo();
    expect(canUndo()).toBe(false);
  });

  it("nested undoable inside undoable forms ONE undo group", async () => {
    await openTestDb();
    const inner = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "inner1",
          column: "name",
          value: "Inner",
        },
      ]);
    });
    const outer = undoable(async () => {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "accounts",
          row: "outer1",
          column: "name",
          value: "Outer",
        },
      ]);
      await inner(); // nested — should NOT start a new undo group
    });

    await outer();

    let outer1 = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "outer1",
    ]);
    let inner1 = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "inner1",
    ]);
    expect(outer1?.tombstone).toBe(0);
    expect(inner1?.tombstone).toBe(0);

    await undo(); // one undo() call must reverse BOTH rows (one group)

    outer1 = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "outer1",
    ]);
    inner1 = await first<{ tombstone: number }>("SELECT tombstone FROM accounts WHERE id = ?", [
      "inner1",
    ]);
    expect(outer1?.tombstone).toBe(1);
    expect(inner1?.tombstone).toBe(1);
    expect(canUndo()).toBe(false); // it was the only group
  });
});

describe("undo — disable-flag and no-recording paths", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("undo() itself is not recorded: canUndo() reflects one fewer group and HISTORY did not grow from the undo call", async () => {
    await openTestDb();
    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });

    await setName("acc1", "First");
    await setName("acc2", "Second");
    expect(canUndo()).toBe(true);

    await undo(); // reverses op 2
    expect(canUndo()).toBe(true); // op 1 still undoable

    await undo(); // reverses op 1
    expect(canUndo()).toBe(false);

    // A third undo() is a no-op (nothing left) and must not throw or flip
    // canUndo() back to true.
    const tables = await undo();
    expect(tables).toEqual([]);
    expect(canUndo()).toBe(false);
  });

  it("a mutation with messages.length === 0 records nothing", async () => {
    await openTestDb();
    const noop = undoable(async () => {
      await sendMessages([]); // nothing to send
    });
    expect(canUndo()).toBe(false);
    await noop();
    expect(canUndo()).toBe(false);
  });

  it("history trimming: >20 marker groups drops the oldest, undo still works at the boundary", async () => {
    await openTestDb();
    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });

    // Create 25 undo groups (HISTORY_SIZE = 20) — the oldest 5 should drop.
    for (let i = 0; i < 25; i++) {
      await setName(`acc${i}`, `Name${i}`);
    }
    expect(canUndo()).toBe(true);

    // Undo everything that's still recorded; it must not throw even though
    // some early groups were trimmed away.
    let undoCount = 0;
    while (canUndo()) {
      await undo();
      undoCount++;
      if (undoCount > 30) break; // safety guard against infinite loop
    }
    expect(canUndo()).toBe(false);
    // At most HISTORY_SIZE groups survive trimming.
    expect(undoCount).toBeLessThanOrEqual(20);
    expect(undoCount).toBeGreaterThan(0);

    // The most recent write (acc24) — from a group well within the trimmed
    // window — must have been reversed.
    const acc24 = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc24"],
    );
    expect(acc24?.tombstone).toBe(1);
  });
});

describe("undo — batchMessages + undoable interaction (fixed by plan 004)", () => {
  beforeEach(() => {
    clearUndo();
  });
  afterEach(async () => {
    resetBatchState();
    await closeTestDb();
  });

  it("wrapping the OUTER call (the one that owns batchMessages) in undoable() records the whole batch as one undo group — plan 004's fix", async () => {
    await openTestDb();
    // The inner mutation being undoable is NOT enough on its own: its
    // undoable() scope exits (sets _undoListening back to false) before
    // batchMessages' buffered flush runs. Plan 004's fix is to ALSO wrap
    // the outer function that calls batchMessages in undoable() — that
    // keeps _undoListening true through the whole batch flush, since the
    // outer scope's `finally` only runs after the awaited batchMessages()
    // call (and its flush) has completed. This mirrors how save.ts /
    // index.ts now wrap saveTransaction / moveTransaction.
    const setName = undoable(async (id: string, name: string) => {
      await sendMessages([
        { timestamp: Timestamp.send()!, dataset: "accounts", row: id, column: "name", value: name },
      ]);
    });
    const saveBatch = undoable(async () => {
      await batchMessages(async () => {
        await setName("acc1", "Batched");
        await setName("acc2", "AlsoBatched");
      });
    });

    expect(canUndo()).toBe(false);

    await saveBatch();

    let acc1 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc1"]);
    let acc2 = await first<{ name: string }>("SELECT name FROM accounts WHERE id = ?", ["acc2"]);
    expect(acc1?.name).toBe("Batched");
    expect(acc2?.name).toBe("AlsoBatched");

    // Fixed behavior: the whole batched, outer-undoable-wrapped call IS
    // recorded as a single undo group.
    expect(canUndo()).toBe(true);

    await undo(); // one undo() reverses the ENTIRE batch, both rows

    const acc1Row = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc1"],
    );
    const acc2Row = await first<{ tombstone: number }>(
      "SELECT tombstone FROM accounts WHERE id = ?",
      ["acc2"],
    );
    expect(acc1Row?.tombstone).toBe(1);
    expect(acc2Row?.tombstone).toBe(1);
    expect(canUndo()).toBe(false); // it was the only group
  });
});
