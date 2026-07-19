/**
 * Hand-written parser for the `#cleanup` note DSL.
 *
 * Faithful port of upstream's PEG grammar (loot-core
 * server/budget/cleanup-template.pegjs) — PEG.js generates its parser at build
 * time and does not run under Hermes, so the whole app hand-writes these
 * parsers (same as the goals `#template` parser). This replicates the grammar's
 * ordered-choice alternatives and its full-consume-or-fail semantics exactly.
 *
 * Grammar (5 note variants):
 *   #cleanup source                → global source
 *   #cleanup sink [N]              → global sink, weight N (default 1)
 *   #cleanup <Name> source         → group source
 *   #cleanup <Name> sink [N]       → group sink
 *   #cleanup <Name>                → group "overspend" member
 */
import type { ParsedCleanupRow } from "./types";

/** weight = `+w || 1`: only unsigned ints; 0 or missing collapse to 1. */
function coerceWeight(token: string | undefined): number {
  if (token === undefined) return 1;
  return parseInt(token, 10) || 1;
}

/**
 * Parse a single already-trimmed line. Returns null when the line is not a
 * valid `#cleanup` directive (unparseable lines are silently skipped upstream).
 * Mirrors `parse()`: the `#cleanup` literal is lowercase and needs ≥1 space.
 */
export function parseCleanupLine(line: string): ParsedCleanupRow | null {
  const head = /^#cleanup( +)(.*)$/.exec(line);
  if (!head) return null;
  const rest = head[2];

  // Alt 1: bare `source`
  if (rest === "source") return { type: "source", group: null };

  // Alt 2: `sink [_?] [weight]` (weight may be space-separated or adjacent)
  const sinkOnly = /^sink *(\d+)?$/.exec(rest);
  if (sinkOnly) return { type: "sink", group: null, weight: coerceWeight(sinkOnly[1]) };

  // Alt 3: `<group> source` — group is everything up to the first " source".
  const srcIdx = rest.indexOf(" source");
  if (srcIdx > 0) {
    const group = rest.slice(0, srcIdx);
    const after = rest.slice(srcIdx).replace(/^ +/, "");
    if (after === "source") return { type: "source", group };
  }

  // Alt 4: `[group] sink [weight]` — group is everything up to the first " sink".
  const sinkIdx = rest.indexOf(" sink");
  if (sinkIdx >= 0) {
    const group = rest.slice(0, sinkIdx);
    const after = rest.slice(sinkIdx).replace(/^ +/, "");
    const m = /^sink *(\d+)?$/.exec(after);
    if (m) return { type: "sink", group: group || null, weight: coerceWeight(m[1]) };
  }

  // Alt 5: bare group name (overspend member) — no " source" delimiter present.
  // (The grammar's sourcegroup only stops at " source", not " sink".)
  if (rest.length > 0 && rest.indexOf(" source") === -1) {
    return { type: "overspend", group: rest };
  }

  return null;
}

/**
 * Scan a category's note text and return every valid `#cleanup` directive.
 * Gate mirrors upstream: case-insensitive `#cleanup ` prefix test, but the line
 * is parsed with original casing (so `#Cleanup` passes the gate yet fails the
 * lowercase-literal parse and is skipped). Overspend rows with an empty group
 * are dropped.
 */
export function parseCleanupNote(note: string | null | undefined): ParsedCleanupRow[] {
  if (!note) return [];
  const rows: ParsedCleanupRow[] = [];
  for (const rawLine of note.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed.toLowerCase().startsWith("#cleanup ")) continue;
    const parsed = parseCleanupLine(trimmed);
    if (!parsed) continue;
    if (parsed.type === "overspend" && parsed.group === "") continue;
    rows.push(parsed);
  }
  return rows;
}
