/** One staged assignment edit: the committed value at edit start vs. the draft. */
export interface PendingEdit {
  /** The live committed amount (cents) when this row was first edited. */
  original: number;
  /** The current staged amount (cents), not yet saved. */
  value: number;
}

/** Staged, uncommitted assignment edits keyed by category id. */
export type PendingEdits = Record<string, PendingEdit>;
