/**
 * Notes — writer for the shared `notes` table.
 *
 * Notes are a cross-cutting entity: categories, accounts, payees, schedules and
 * the per-month budget movements all store their note in the same `notes` table,
 * keyed by the entity's own id. This module is the generic write path; read via
 * a plain `SELECT note FROM notes WHERE id = ?` (see `goals/persist.getCategoryNote`).
 */

import { sendMessages } from "@/core/sync";
import { undoable } from "@/core/sync/undo";
import { Timestamp } from "@/core/crdt";

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
