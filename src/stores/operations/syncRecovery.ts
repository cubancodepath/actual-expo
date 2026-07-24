// Sync-recovery operations — the appSlice-equivalent recovery thunks
// (upstream desktop-client sync-events + loot-core sync/reset). These
// orchestrate across syncStore + sessionStore + budgetContextStore, so they
// live in the operations layer (one-way: operations → stores → core), NOT
// inside a store — that keeps the stores free of sibling-store imports and
// out of module-init cycles.
import { fullSync } from "@/core/sync";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { readMetadata, deleteBudgetDir, loadPrefs } from "@/core/server/prefs";
import { getRemoteFiles, uploadBudget, downloadBudget } from "@/core/server/cloud-storage";
import { resetSync as coreResetSync } from "@/core/sync/reset";
import { useSyncStore } from "@/stores/syncStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

// One-shot guard for the automatic recoveries: if e.g. resetSync's own upload
// gets rejected again, retrying in a loop would hammer the server — fall
// through to the conflict dialog instead. Cleared on any successful recovery
// and on a budget switch (loadBudget calls clearAutoRecoveryGuard()).
const autoRecoveryAttempted = new Set<ErrorCode>();

/** Reset the one-shot auto-recovery guard (successful recovery / budget switch). */
export function clearAutoRecoveryGuard(): void {
  autoRecoveryAttempted.clear();
}

/** Clear the conflict state AND the recovery guard (a resolution happened). */
function resolveConflict(): void {
  clearAutoRecoveryGuard();
  useSyncStore.getState()._resolveConflict();
}

/** "Upload this device as the new truth" (upstream appSlice `resetSync`). */
export async function resetSync(): Promise<void> {
  const { serverUrl, token } = useSessionStore.getState();
  const { activeBudgetId } = useBudgetContextStore.getState();
  const meta = await readMetadata(activeBudgetId);
  if (!meta?.cloudFileId) {
    throw new ActualError("file/upload-failed", { context: { reason: "no cloudFileId" } });
  }

  // Delegate the reset protocol (checkKey guard → server reset → wipe local
  // CRDT state → clear sync metadata → re-upload) to core's resetSync —
  // upstream sync/reset.ts, the same op the encryption flows use. The
  // checkKey guard matters: it refuses to upload a file encrypted with a
  // key the server no longer accepts.
  const result = await coreResetSync({
    serverUrl,
    token,
    cloudFileId: meta.cloudFileId,
    budgetId: activeBudgetId,
  });
  if ("error" in result) {
    const reason = result.error.reason;
    throw new ActualError(
      reason === "network"
        ? "network/offline"
        : reason === "file-has-new-key"
          ? "sync/file-has-new-key"
          : "file/upload-failed",
      { context: { operation: "resetSync", reason } },
    );
  }

  useBudgetContextStore
    .getState()
    .setBudgetContext({ groupId: result.groupId ?? "", lastSyncedTimestamp: undefined });
  // Refresh core's prefs snapshot — the sync engine reads groupId from there.
  await loadPrefs(activeBudgetId);

  resolveConflict();
  // A rejection here reports through the sync-event listener like any other
  // sync; re-entry into this recovery is bounded by autoRecoveryAttempted.
  await fullSync({ force: true });
}

/** "Revert to the server's version" — re-download the file fresh and reopen. */
export async function redownloadBudget(): Promise<void> {
  const { serverUrl, token } = useSessionStore.getState();
  const { activeBudgetId } = useBudgetContextStore.getState();
  const meta = await readMetadata(activeBudgetId);
  const cloudFileId = meta?.cloudFileId;
  if (!cloudFileId) {
    throw new ActualError("file/download-failed", { context: { reason: "no cloudFileId" } });
  }

  // The stale local groupId is the whole problem — fetch the server's current
  // file record instead of reusing metadata.
  const files = await getRemoteFiles(serverUrl, token);
  const remote = files.find((f) => f.fileId === cloudFileId && !f.deleted);
  if (!remote) {
    throw new ActualError("file/download-failed", {
      context: { reason: "file no longer exists on server", cloudFileId },
    });
  }

  await useBudgetContextStore.getState().closeBudget();
  const newBudgetId = await downloadBudget(serverUrl, token, remote);
  await deleteBudgetDir(activeBudgetId);

  resolveConflict();
  await useBudgetContextStore.getState().loadBudget(newBudgetId);
}

/** Single entry point for sync/file-* rejections: auto-recover or raise conflict. */
export async function handleSyncFileError(code: ErrorCode): Promise<void> {
  const sync = useSyncStore.getState();

  switch (code) {
    case "sync/file-has-reset":
    case "sync/file-has-new-key":
    case "sync/file-old-version":
      sync._setConflict(code);
      return;

    case "sync/file-needs-upload":
    case "sync/file-not-found": {
      // Server lost/never had the sync state for this file — this device's
      // copy is the only candidate, so re-registering it is safe to automate
      // (upstream's "Upload"/"Register" notification buttons).
      if (autoRecoveryAttempted.has(code)) {
        sync._setConflict(code);
        return;
      }
      autoRecoveryAttempted.add(code);
      try {
        if (code === "sync/file-needs-upload") {
          await resetSync();
        } else {
          const { serverUrl, token } = useSessionStore.getState();
          const { activeBudgetId } = useBudgetContextStore.getState();
          const { groupId } = await uploadBudget(serverUrl, token, activeBudgetId);
          useBudgetContextStore.getState().setBudgetContext({ groupId });
          resolveConflict();
        }
      } catch (e) {
        emitErrorEvent(e, { operation: "syncRecovery.auto", code });
        sync._setConflict(code);
      }
      return;
    }

    case "sync/file-key-mismatch":
      // Key rotated server-side — same UX as sync/key-missing: the reopen
      // flow prompts for the new password.
      sync._setErrorCode("sync/key-missing");
      return;

    default:
      sync._setErrorCode(code);
  }
}
