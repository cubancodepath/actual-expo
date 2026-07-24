import { describe, it, expect, afterEach } from "vitest";
import { openTestDb, closeTestDb } from "@/core/db/__tests__/testDb";
import { first, runQuery } from "@/core/db";
import { createCategoryGroup, createCategory } from "@/core/server/budget";
import { setNote } from "@/core/server/notes";
import { storeNoteCleanups } from "../cleanup-template-notes";
import type { CleanupTemplate } from "@/core/types/models";

/**
 * Mirrors upstream cleanup-template-notes.test.ts (storeNoteCleanups): parsing
 * notes into cleanup_def + cleanup_groups, group resolution, clearing, and
 * orphan tombstoning/resurrection.
 */
async function defOf(categoryId: string): Promise<CleanupTemplate[] | null> {
  const row = await first<{ cleanup_def: string | null }>(
    "SELECT cleanup_def FROM categories WHERE id = ?",
    [categoryId],
  );
  return row?.cleanup_def ? (JSON.parse(row.cleanup_def) as CleanupTemplate[]) : null;
}

describe("storeNoteCleanups", () => {
  afterEach(async () => {
    await closeTestDb();
  });

  async function makeCategory(name: string, note: string | null): Promise<string> {
    const group = await createCategoryGroup({ name: `G-${name}` });
    const id = await createCategory({ name, group: group });
    if (note !== null) await setNote(id, note);
    return id;
  }

  it("persists global source/sink lines as cleanup_def with null groupId", async () => {
    await openTestDb();
    const src = await makeCategory("Src", "#cleanup source");
    const snk = await makeCategory("Snk", "#cleanup sink 2");

    await storeNoteCleanups();

    expect(await defOf(src)).toEqual([{ role: "source", groupId: null }]);
    expect(await defOf(snk)).toEqual([{ role: "sink", groupId: null, weight: 2 }]);
  });

  it("resolves shared group names to one id, case-insensitively, keeping first casing", async () => {
    await openTestDb();
    const a = await makeCategory("A", "#cleanup Vacations source");
    const b = await makeCategory("B", "#cleanup vacations sink");
    const c = await makeCategory("C", "#cleanup VACATIONS");

    await storeNoteCleanups();

    const defA = await defOf(a);
    const defB = await defOf(b);
    const defC = await defOf(c);
    const groupId = (defA![0] as { groupId: string }).groupId;
    expect(groupId).toBeTruthy();
    expect((defB![0] as { groupId: string }).groupId).toBe(groupId);
    expect((defC![0] as { groupId: string }).groupId).toBe(groupId);

    const groups = await runQuery<{ id: string; name: string }>(
      "SELECT id, name FROM cleanup_groups WHERE tombstone = 0",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Vacations"); // first-seen casing
  });

  it("clears cleanup_def for a category whose note no longer carries cleanup", async () => {
    await openTestDb();
    const id = await makeCategory("X", "#cleanup source");
    await storeNoteCleanups();
    expect(await defOf(id)).not.toBeNull();

    await setNote(id, "just a plain note now");
    await storeNoteCleanups();
    expect(await defOf(id)).toBeNull();
  });

  it("tombstones a group that no longer has any live member", async () => {
    await openTestDb();
    const id = await makeCategory("X", "#cleanup Trip source");
    await storeNoteCleanups();
    expect((await runQuery("SELECT id FROM cleanup_groups WHERE tombstone = 0")).length).toBe(1);

    await setNote(id, "no more cleanup");
    await storeNoteCleanups();
    expect((await runQuery("SELECT id FROM cleanup_groups WHERE tombstone = 0")).length).toBe(0);
  });

  it("resurrects a tombstoned group when a fresh note references its name", async () => {
    await openTestDb();
    const id = await makeCategory("X", "#cleanup Trip source");
    await storeNoteCleanups();
    const original = await first<{ id: string }>(
      "SELECT id FROM cleanup_groups WHERE lower(name) = 'trip'",
    );

    await setNote(id, "no more cleanup");
    await storeNoteCleanups();
    expect(
      (await first<{ tombstone: number }>("SELECT tombstone FROM cleanup_groups WHERE id = ?", [
        original!.id,
      ]))!.tombstone,
    ).toBe(1);

    // A fresh reference to the same name reuses (resurrects) the same group id.
    const id2 = await makeCategory("Y", "#cleanup trip source");
    await storeNoteCleanups();
    const def2 = await defOf(id2);
    expect((def2![0] as { groupId: string }).groupId).toBe(original!.id);
    expect(
      (await first<{ tombstone: number }>("SELECT tombstone FROM cleanup_groups WHERE id = ?", [
        original!.id,
      ]))!.tombstone,
    ).toBe(0);
  });
});
