/**
 * listenForSyncEvent — the app-layer sync policy owner. Port of upstream
 * desktop-client/src/sync-events.ts.
 *
 * Core (fullSync/applyMessages) only EMITS sync events — start, success,
 * applied, prefs-updated, error — and never reads app stores or rethrows to
 * its schedulers. This single listener maps those events to app reactions:
 * status/lastSync bookkeeping, the conflict-recovery flow, session teardown
 * on an expired token, and error reporting. Because every sync path
 * (scheduled push, 60s poll, foreground, pull-to-refresh, post-open
 * background sync) reports through this one channel, no path can silently
 * swallow a failure — the bug this architecture replaced.
 */
import type { SyncEvent } from "@/core/sync/syncEvents";
import { listen } from "@/core/sync/syncEvents";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";
import type { ErrorCode } from "@/core/errors";
import { useSyncStore } from "@/stores/syncStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { signOut } from "@/stores/operations/users";
import { handleSyncFileError } from "@/stores/operations/syncRecovery";

// Static imports: sync-events is a leaf of the app graph (nothing it imports
// imports it back), so there is no cycle to break with dynamic imports.

async function handleSyncError(subtype: string, meta: unknown): Promise<void> {
  if (subtype === "auth/token-expired") {
    // Session teardown, not a user-visible error. signOut() is the single
    // full-teardown path (closes the budget + DB first) — same handler the
    // react-query 401 hook uses.
    emitErrorEvent(meta);
    useSyncStore.getState()._setStatus("idle");
    await signOut();
    return;
  }

  if (subtype.startsWith("sync/file-")) {
    // Server file-state rejection (reset/re-encrypted/format change on
    // another client): auto-recover or raise the conflict dialog.
    emitErrorEvent(meta);
    await handleSyncFileError(subtype as ErrorCode);
    return;
  }

  if (subtype === "network/offline") {
    // Expected local-first condition — log only, no error state.
    emitErrorEvent(meta);
    useSyncStore.getState()._setStatus("idle");
    return;
  }

  emitErrorEvent(meta);
  useSyncStore.getState()._setErrorCode(toErrorCode(meta));
}

async function handleSyncEvent(event: SyncEvent): Promise<void> {
  switch (event.type) {
    case "start":
      useSyncStore.getState()._setStatus("syncing");
      return;
    case "success":
      // The emitter is generation-guarded: a sync that outlived a budget
      // switch returns without emitting, so this can't stamp a stale
      // success/lastSync onto the newly opened budget.
      useSyncStore.getState()._setStatus("success");
      return;
    case "error":
      await handleSyncError(event.subtype, event.meta);
      return;
    case "prefs-updated":
      // Mirror synced budget prefs into the reactive store (core already
      // persisted them via savePrefs).
      if (typeof event.prefs.budgetName === "string") {
        useBudgetContextStore.getState().setBudgetContext({ budgetName: event.prefs.budgetName });
      }
      return;
    default:
      return; // "applied" — data reactivity is liveQuery's job
  }
}

/** Register the policy listener. Call ONCE at app startup; returns unlisten. */
export function listenForSyncEvent(): () => void {
  return listen((event) => {
    void handleSyncEvent(event);
  });
}
