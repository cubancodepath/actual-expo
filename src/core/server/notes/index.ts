/**
 * Notes — writer for the shared `notes` table.
 *
 * Notes are a cross-cutting entity: categories, accounts, payees, schedules and
 * the per-month budget movements all store their note in the same `notes` table,
 * keyed by the entity's own id. This module is the generic write path; read via
 * a plain `SELECT note FROM notes WHERE id = ?` (see `goals/persist.getCategoryNote`).
 */

import { first } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { undoable } from "@/core/server/undo";
import { Timestamp } from "@/core/crdt";

/** Read the note for any entity keyed by `id` (null if none). */
export async function getNote(id: string): Promise<string | null> {
  const row = await first<{ note: string | null }>("SELECT note FROM notes WHERE id = ?", [id]);
  return row?.note ?? null;
}

/**
 * Set (or clear, with `null`) the note for any entity keyed by `id`. Writes a
 * single CRDT message to the `notes` dataset so the change syncs like any other.
 */
export const setNote = undoable(async function setNote(
  id: string,
  note: string | null,
): Promise<void> {
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "notes",
      row: id,
      column: "note",
      value: note,
    },
  ]);
});
