/**
 * Cleanup groups — named buckets that tie source/sink/overspend categories
 * together. Port of loot-core server/budget/cleanup-groups.ts, adapted to CRDT
 * writes (sendMessages) instead of db.insertWithSchema.
 *
 * Group name matching is case-insensitive; the first-seen casing is stored.
 * The join category→group is purely by the `groupId` embedded in each
 * category's `cleanup_def` JSON — there is no FK column.
 */
import { randomUUID } from "@/core/platform/crypto";
import { first, runQuery } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { Timestamp } from "@/core/crdt";

/**
 * Resolve a cleanup group name to its id, creating or resurrecting the group as
 * needed. Matching is case-insensitive; a tombstoned group is revived.
 */
export async function resolveCleanupGroup(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Cleanup group name cannot be empty");

  const existing = await first<{ id: string; tombstone: number }>(
    "SELECT id, tombstone FROM cleanup_groups WHERE lower(name) = lower(?) LIMIT 1",
    [trimmed],
  );
  if (existing) {
    if (existing.tombstone === 1) {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "cleanup_groups",
          row: existing.id,
          column: "tombstone",
          value: 0,
        },
      ]);
    }
    return existing.id;
  }

  const id = randomUUID();
  await sendMessages([
    {
      timestamp: Timestamp.send()!,
      dataset: "cleanup_groups",
      row: id,
      column: "name",
      value: trimmed,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "cleanup_groups",
      row: id,
      column: "tombstone",
      value: 0,
    },
  ]);
  return id;
}

/** Resolve many names at once → Map keyed by lowercased name. */
export async function resolveCleanupGroups(names: Iterable<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, await resolveCleanupGroup(name));
  }
  return map;
}

/**
 * Tombstone every live group no longer referenced by any live category's
 * cleanup_def. Mirrors upstream's json_each orphan sweep.
 */
export async function tombstoneOrphanCleanupGroups(): Promise<void> {
  const orphans = await runQuery<{ id: string }>(
    `SELECT id FROM cleanup_groups
     WHERE tombstone = 0
       AND id NOT IN (
         SELECT json_extract(je.value, '$.groupId')
         FROM categories c, json_each(c.cleanup_def) je
         WHERE c.tombstone = 0 AND c.cleanup_def IS NOT NULL
           AND json_extract(je.value, '$.groupId') IS NOT NULL
       )`,
  );
  if (orphans.length === 0) return;
  await sendMessages(
    orphans.map((o) => ({
      timestamp: Timestamp.send()!,
      dataset: "cleanup_groups",
      row: o.id,
      column: "tombstone",
      value: 1,
    })),
  );
}
