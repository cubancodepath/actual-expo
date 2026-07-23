/** Regex to extract #tags from notes — matches #word but not ##escaped */
const TAG_REGEX = /(?<!#)#([^#\s]+)/g;

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
