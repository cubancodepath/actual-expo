/**
 * Types for the #cleanup budget DSL. Faithful port of upstream Actual's
 * cleanup-template model (loot-core/src/types/models/cleanup-templates.ts +
 * the intermediate shape in server/budget/cleanup-template-notes.ts).
 *
 * Two shapes on purpose, matching upstream:
 *  - `ParsedCleanupRow` — the raw per-line parser output (discriminant `type`).
 *  - `CleanupTemplate`   — the compiled form stored JSON-encoded in
 *    `categories.cleanup_def` (discriminant `role`; group names resolved to ids).
 */

/** Raw parser output for a single `#cleanup ...` note line. */
export type ParsedCleanupRow =
  | { type: "source"; group: string | null }
  | { type: "sink"; group: string | null; weight: number }
  | { type: "overspend"; group: string };

/** Compiled cleanup directive stored in `categories.cleanup_def`. */
export type CleanupTemplate =
  | { role: "source"; groupId: string | null }
  | { role: "sink"; groupId: string | null; weight: number }
  | { role: "overspend"; groupId: string };
