import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { runQuery } from "@/core/db";
import { setNote } from "./index";

describe("notes.setNote — routed through CRDT", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  it("writes the note as a single CRDT message on the notes dataset", async () => {
    await openTestDb();

    await setNote("cat-1", "Groceries for the month");

    const logged = await runQuery<{ dataset: string; row: string; column: string }>(
      "SELECT dataset, row, column FROM messages_crdt WHERE dataset = 'notes'",
    );
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ dataset: "notes", row: "cat-1", column: "note" });

    const note = await runQuery<{ note: string }>("SELECT note FROM notes WHERE id = 'cat-1'");
    expect(note[0].note).toBe("Groceries for the month");
  });

  it("clears the note when passed null", async () => {
    await openTestDb();

    await setNote("cat-1", "temporary");
    await setNote("cat-1", null);

    const note = await runQuery<{ note: string | null }>(
      "SELECT note FROM notes WHERE id = 'cat-1'",
    );
    expect(note[0].note).toBeNull();
  });
});
