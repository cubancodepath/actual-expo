/**
 * Compile `#cleanup` notes into `categories.cleanup_def`.
 *
 * Port of loot-core server/budget/cleanup-template-notes.ts::storeNoteCleanups.
 * Scans each category's note, parses cleanup directives, resolves group names to
 * ids, and writes the compiled `CleanupTemplate[]` (or null) to `cleanup_def`.
 * Categories whose automations are UI-managed (template_settings.source ==
 * 'ui') are skipped so stale note text can't clobber them. Runs the orphan
 * group sweep at the end. All writes go through one CRDT batch.
 */
import { runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";
import { parseCleanupNote } from "./parse";
import { resolveCleanupGroups, tombstoneOrphanCleanupGroups } from "./groups";
import type { CleanupTemplate, ParsedCleanupRow } from "./types";

function toCleanupTemplate(row: ParsedCleanupRow, nameToId: Map<string, string>): CleanupTemplate {
  switch (row.type) {
    case "source":
      return {
        role: "source",
        groupId: row.group ? (nameToId.get(row.group.toLowerCase()) ?? null) : null,
      };
    case "sink":
      return {
        role: "sink",
        groupId: row.group ? (nameToId.get(row.group.toLowerCase()) ?? null) : null,
        weight: row.weight,
      };
    case "overspend": {
      const groupId = nameToId.get(row.group.toLowerCase());
      if (!groupId) throw new Error(`Unresolved cleanup group for overspend row: ${row.group}`);
      return { role: "overspend", groupId };
    }
  }
}

/**
 * Recompile cleanup_def from notes for the given categories (or all when
 * omitted). Idempotent; safe to call after any note edit.
 */
export async function storeNoteCleanups(categoryIds?: string[]): Promise<void> {
  let sql = `SELECT c.id AS id, n.note AS note
     FROM categories c
     LEFT JOIN notes n ON n.id = c.id
     WHERE c.tombstone = 0
       AND COALESCE(JSON_EXTRACT(c.template_settings, '$.source'), 'notes') <> 'ui'`;
  const params: string[] = [];
  if (categoryIds) {
    if (categoryIds.length === 0) return;
    sql += ` AND c.id IN (${categoryIds.map(() => "?").join(",")})`;
    params.push(...categoryIds);
  }
  const candidates = await runQuery<{ id: string; note: string | null }>(sql, params);

  // Parse every candidate note; gather all group names to resolve at once.
  const parsedByCategory = new Map<string, ParsedCleanupRow[]>();
  const groupNames = new Set<string>();
  for (const c of candidates) {
    const rows = parseCleanupNote(c.note);
    parsedByCategory.set(c.id, rows);
    for (const r of rows) if (r.group) groupNames.add(r.group);
  }

  // NOTE: writes are applied immediately (not wrapped in batchMessages).
  // batchMessages buffers until flush, but tombstoneOrphanCleanupGroups reads
  // the just-written cleanup_def to decide which groups are orphaned — it must
  // see those writes. Upstream relies on db.updateWithSchema's immediate write
  // for the same read-after-write ordering.
  const nameToId = await resolveCleanupGroups(groupNames);

  const messages = candidates.map((c) => {
    const rows = parsedByCategory.get(c.id) ?? [];
    const value =
      rows.length === 0 ? null : JSON.stringify(rows.map((r) => toCleanupTemplate(r, nameToId)));
    return {
      timestamp: Timestamp.send()!,
      dataset: "categories",
      row: c.id,
      column: "cleanup_def",
      value,
    };
  });
  if (messages.length > 0) await sendMessages(messages);

  await tombstoneOrphanCleanupGroups();
}
