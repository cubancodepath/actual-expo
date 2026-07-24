/**
 * Global syncing mode — ported from upstream (server/sync/index.ts:41-78).
 *
 * - "enabled": normal operation.
 * - "offline": sync is paused — scheduled syncs are skipped, but
 *   applyMessages() still behaves like "enabled" (merkle/CRDT log stays
 *   consistent) so nothing is lost once syncing resumes.
 * - "disabled": sync is fully off.
 * - "import": fast-path bulk apply — skips compareMessages, the
 *   messages_crdt log, the merkle trie, and undo tracking. Only safe for
 *   bulk-loading data that doesn't need to be replayed to peers (a fresh
 *   local-only import), never for anything that must converge with a
 *   synced budget.
 *
 * Mode transitions (every setter, so pauses can't strand):
 *
 *   → "offline"
 *     · loadBudget: budget has no cloud target — local-only or never
 *       uploaded (upstream main.ts:316: no-server budgets load as offline)
 *     · fullSync catch on network/offline: transient connectivity pause
 *     · syncStore._setConflict: unresolved file-state conflict — the pause
 *       core's scheduleFullSync can see without importing stores
 *   → "enabled"
 *     · loadBudget: budget HAS a cloud target (re-set on every open)
 *     · fullSync success: clears a prior network pause
 *     · app foreground: always a real retry (guarded: not local-only, no
 *       pending conflict)
 *     · syncStore._resolveConflict: conflict resolved
 *     · upload/convert/re-register flows: cloud coordinates changed
 *   → "disabled" / "import": test/bulk-import paths only.
 */

export type SyncingMode = "enabled" | "offline" | "disabled" | "import";

let _mode: SyncingMode = "enabled";

/** Sets the mode and returns the previous one, so callers can restore it. */
export function setSyncingMode(mode: SyncingMode): SyncingMode {
  const prev = _mode;
  _mode = mode;
  return prev;
}

export function checkSyncingMode(mode: SyncingMode): boolean {
  switch (mode) {
    case "enabled":
      return _mode === "enabled" || _mode === "offline";
    case "disabled":
      return _mode === "disabled" || _mode === "import";
    case "offline":
      return _mode === "offline";
    case "import":
      return _mode === "import";
  }
}
