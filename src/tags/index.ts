import { randomUUID } from "expo-crypto";
import { runQuery, first } from "../db";
import { sendMessages } from "../sync";
import { undoable } from "../sync/undo";
import { Timestamp } from "../crdt";
import type { TagRow } from "../db/types";
import type { Tag } from "./types";

/** Regex to extract #tags from notes — matches #word but not ##escaped */
const TAG_REGEX = /(?<!#)#([^#\s]+)/g;

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

// ---------------------------------------------------------------------------
// Notes parsing — split notes into text + tag segments for rendering
// ---------------------------------------------------------------------------

export type NoteSegment =
  | { type: "text"; content: string }
  | { type: "tag"; content: string; tagName: string };

/** Parse a notes string into text and tag segments for rich rendering. */
export function parseNotes(notes: string | null): NoteSegment[] {
  if (!notes) return [];

  const segments: NoteSegment[] = [];
  const regex = new RegExp(TAG_REGEX.source, TAG_REGEX.flags);
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(notes)) !== null) {
    // Text before the tag
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: notes.slice(lastIndex, match.index) });
    }
    // The tag itself
    segments.push({ type: "tag", content: match[0], tagName: match[1] });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last tag
  if (lastIndex < notes.length) {
    segments.push({ type: "text", content: notes.slice(lastIndex) });
  }

  return segments;
}

/** Extract tag names from a notes string. */
export function extractTagsFromNotes(notes: string | null): string[] {
  if (!notes) return [];
  const tags: string[] = [];
  let match;
  while ((match = TAG_REGEX.exec(notes)) !== null) {
    tags.push(match[1]);
  }
  TAG_REGEX.lastIndex = 0; // reset global regex
  return tags;
}

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
