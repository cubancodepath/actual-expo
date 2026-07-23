import { randomUUID } from "@/core/platform/crypto";
import { runQuery, first } from "@/core/db";
import { sendMessages } from "@/core/sync";
import { undoable } from "@/core/sync/undo";
import { Timestamp } from "@/core/crdt";
import type { TagRow } from "@/core/db/types";
import type { Tag } from "@/core/types/models";
import { extractTagsFromNotes } from "@/core/shared/tags";

function rowToTag(r: TagRow): Tag {
  return {
    id: r.id,
    tag: r.tag,
    color: r.color,
    description: r.description,
    tombstone: r.tombstone === 1,
  };
}

export async function getTags(): Promise<Tag[]> {
  const rows = await runQuery<TagRow>("SELECT * FROM tags WHERE tombstone = 0 ORDER BY tag");
  return rows.map(rowToTag);
}

export const createTag = undoable(async function createTag(
  fields: Pick<Tag, "tag"> & Partial<Pick<Tag, "color" | "description">>,
): Promise<string> {
  const tagName = fields.tag.trim();

  // If tag exists but is tombstoned, restore it
  const existing = await first<TagRow>("SELECT * FROM tags WHERE tag = ?", [tagName]);
  if (existing) {
    if (existing.tombstone === 1) {
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "tags",
          row: existing.id,
          column: "tombstone",
          value: 0,
        },
        ...(fields.color !== undefined
          ? [
              {
                timestamp: Timestamp.send()!,
                dataset: "tags",
                row: existing.id,
                column: "color",
                value: fields.color ?? null,
              },
            ]
          : []),
        ...(fields.description !== undefined
          ? [
              {
                timestamp: Timestamp.send()!,
                dataset: "tags",
                row: existing.id,
                column: "description",
                value: fields.description ?? null,
              },
            ]
          : []),
      ]);
    }
    return existing.id;
  }

  const id = randomUUID();
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "tags", row: id, column: "tag", value: tagName },
    {
      timestamp: Timestamp.send()!,
      dataset: "tags",
      row: id,
      column: "color",
      value: fields.color ?? null,
    },
    {
      timestamp: Timestamp.send()!,
      dataset: "tags",
      row: id,
      column: "description",
      value: fields.description ?? null,
    },
  ]);
  return id;
});

export const updateTag = undoable(async function updateTag(
  id: string,
  fields: Partial<Pick<Tag, "tag" | "color" | "description">>,
): Promise<void> {
  const dbFields: Record<string, string | null> = {};
  if (fields.tag !== undefined) dbFields.tag = fields.tag.trim();
  if (fields.color !== undefined) dbFields.color = fields.color;
  if (fields.description !== undefined) dbFields.description = fields.description;
  if (Object.keys(dbFields).length === 0) return;

  await sendMessages(
    Object.entries(dbFields).map(([column, value]) => ({
      timestamp: Timestamp.send()!,
      dataset: "tags",
      row: id,
      column,
      value,
    })),
  );
});

export const deleteTag = undoable(async function deleteTag(id: string): Promise<void> {
  await sendMessages([
    { timestamp: Timestamp.send()!, dataset: "tags", row: id, column: "tombstone", value: 1 },
  ]);
});

/** Scan all transaction notes and create any tags not yet in the DB. */
export async function discoverTags(): Promise<Tag[]> {
  const rows = await runQuery<{ notes: string }>(
    "SELECT notes FROM transactions WHERE tombstone = 0 AND notes LIKE '%#%'",
  );

  const discoveredNames = new Set<string>();
  for (const row of rows) {
    for (const tag of extractTagsFromNotes(row.notes)) {
      discoveredNames.add(tag);
    }
  }

  // Get existing tag names
  const existingRows = await runQuery<TagRow>("SELECT * FROM tags");
  const existingNames = new Set(existingRows.map((r) => r.tag));

  // Create tags that don't exist yet
  const newTags: Tag[] = [];
  for (const name of discoveredNames) {
    if (!existingNames.has(name)) {
      const id = await createTag({ tag: name });
      newTags.push({ id, tag: name, color: null, description: null, tombstone: false });
    }
  }

  return newTags;
}
