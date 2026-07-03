/**
 * Global syncing mode — ported from upstream (server/sync/index.ts:41-78).
 *
 * - "enabled": normal operation (default).
 * - "offline": sync is paused (e.g. after a network failure) but not
 *   disabled — scheduled syncs are skipped, but applyMessages() still
 *   behaves like "enabled" (merkle/CRDT log stays consistent) so nothing
 *   is lost once connectivity returns.
 * - "disabled": sync is fully off (e.g. local-only budget).
 * - "import": fast-path bulk apply — skips compareMessages, the
 *   messages_crdt log, the merkle trie, and undo tracking. Only safe for
 *   bulk-loading data that doesn't need to be replayed to peers (a fresh
 *   local-only import), never for anything that must converge with a
 *   synced budget.
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
