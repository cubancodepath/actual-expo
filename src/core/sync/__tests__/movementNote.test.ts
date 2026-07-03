import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { addMovementNote } from "@/core/domain/budgets";
import { runQuery } from "@/core/db";

describe("addMovementNote — routed through CRDT (fix #3)", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("produces a CRDT message for the notes dataset instead of a raw SQL write", async () => {
    await openTestDb();

    await addMovementNote({
      month: "2026-07",
      amountCents: 2500,
      fromName: "Groceries",
      toName: "Dining Out",
    });

    const logged = await runQuery<{ dataset: string; row: string; column: string }>(
      "SELECT dataset, row, column FROM messages_crdt WHERE dataset = 'notes'",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ dataset: "notes", row: "budget-2026-07", column: "note" });

    const note = await runQuery<{ note: string }>(
      "SELECT note FROM notes WHERE id = 'budget-2026-07'",
    );
    expect(note[0].note).toContain("Groceries");
    expect(note[0].note).toContain("Dining Out");
  });

  it("appends to an existing note rather than overwriting it, still as a single CRDT message", async () => {
    await openTestDb();

    await addMovementNote({ month: "2026-07", amountCents: 1000, fromName: "A", toName: "B" });
    await addMovementNote({ month: "2026-07", amountCents: 2000, fromName: "C", toName: "D" });

    const logged = await runQuery("SELECT id FROM messages_crdt WHERE dataset = 'notes'");
    expect(logged).toHaveLength(2);

    const note = await runQuery<{ note: string }>(
      "SELECT note FROM notes WHERE id = 'budget-2026-07'",
    );
    expect(note[0].note.split("\n")).toHaveLength(2);
  });
});
