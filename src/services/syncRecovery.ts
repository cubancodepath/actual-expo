import { post } from "@/core/post";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { clearLocalSyncState, fullSync, setSyncingMode } from "@/core/sync";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSyncStore } from "@/stores/syncStore";
import { readMetadata, updateMetadata, deleteBudgetDir } from "./budgetMetadata";
import { getRemoteFiles } from "./api/budgetFiles.api";

/**
 * Recovery from server file-state sync rejections (sync/file-* codes) —
 * the expo counterpart of upstream desktop-client/src/sync-events.ts +
 * loot-core/src/server/sync/reset.ts.
 *
 * The server rejects /sync/sync when its file record no longer matches the
 * client's (another client reset the file, rotated the encryption key, or
 * the sync format version changed). Without recovery, every scheduled sync
 * fails forever — these paths either fix it automatically or pause sync and
 * surface SyncConflictDialog so the user picks a side.
 */

// One-shot guard for the automatic recoveries: if e.g. resetSyncBudget's own
// upload gets rejected again, retrying in a loop would hammer the server —
// fall through to the conflict dialog instead. Cleared on any successful
// recovery (and implicitly irrelevant after budget switches, since a
// successful open resets sync state).
const autoRecoveryAttempted = new Set<ErrorCode>();

function activeContext() {
  const { serverUrl, token } = useSessionStore.getState();
  const { activeBudgetId } = useBudgetContextStore.getState();
  return { serverUrl, token, activeBudgetId };
}

function resolveConflict(): void {
  autoRecoveryAttempted.clear();
  useSyncStore.getState().clearConflict();
  useSyncStore.getState()._setStatus("idle");
  setSyncingMode("enabled");
}

/**
 * "Upload this device as the new truth" — upstream resetSync(): reset the
 * server's sync group, wipe the local CRDT log so the current db becomes a
 * fresh baseline, and re-upload the full file. Other clients will get
 * file-has-reset on their next sync and have to re-download.
 */
export async function resetSyncBudget(): Promise<void> {
  const { serverUrl, token, activeBudgetId } = activeContext();
  const meta = await readMetadata(activeBudgetId);
  if (!meta?.cloudFileId) {
    throw new ActualError("file/upload-failed", { context: { reason: "no cloudFileId" } });
  }

  await post(`${serverUrl}/sync/reset-user-file`, { token, fileId: meta.cloudFileId });

  await clearLocalSyncState();
  await updateMetadata(activeBudgetId, {
    groupId: undefined,
    lastSyncedTimestamp: undefined,
    lastUploaded: undefined,
  });
  useBudgetContextStore
    .getState()
    .setBudgetContext({ groupId: "", lastSyncedTimestamp: undefined });

  const { uploadBudget } = await import("./budgetfiles");
  const { groupId } = await uploadBudget(serverUrl, token, activeBudgetId);
  useBudgetContextStore.getState().setBudgetContext({ groupId });

  resolveConflict();
  // Direct fullSync (not syncStore.sync): a sync/file-* rejection here must
  // not re-enter the recovery policy that called us. Report-only.
  await fullSync({ force: true }).catch((e) => emitErrorEvent(e));
}

/**
 * "Revert to the server's version" — discard this device's unsynced changes:
 * re-download the file fresh (picking up the server's NEW groupId) into a new
 * local dir, delete the old copy, and reopen.
 */
export async function redownloadBudget(): Promise<void> {
  const { serverUrl, token, activeBudgetId } = activeContext();
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

  const { closeBudget, downloadBudget, loadBudget } = await import("./budgetfiles");
  await closeBudget();
  const newBudgetId = await downloadBudget(serverUrl, token, remote);
  await deleteBudgetDir(activeBudgetId);

  resolveConflict();
  await loadBudget(newBudgetId);
}

/**
 * Single entry point for sync/file-* rejections, fire-and-forget: pauses
 * scheduled syncs and either auto-recovers or leaves the decision to the
 * user via syncStore.conflictCode (SyncConflictDialog renders off it).
 */
export async function handleSyncFileError(code: ErrorCode): Promise<void> {
  // Pause scheduled syncs while the conflict is unresolved. "offline", not
  // "disabled": applyMessages keeps recording local mutations in the CRDT
  // log, so nothing is lost whichever way the user resolves.
  setSyncingMode("offline");

  switch (code) {
    case "sync/file-has-reset":
    case "sync/file-has-new-key":
    case "sync/file-old-version":
      useSyncStore.getState()._setConflict(code);
      return;

    case "sync/file-needs-upload":
    case "sync/file-not-found": {
      // Server lost/never had the sync state for this file — this device's
      // copy is the only candidate, so re-registering it is safe to automate
      // (upstream's "Upload"/"Register" notification buttons).
      if (autoRecoveryAttempted.has(code)) {
        useSyncStore.getState()._setConflict(code);
        return;
      }
      autoRecoveryAttempted.add(code);
      try {
        if (code === "sync/file-needs-upload") {
          await resetSyncBudget();
        } else {
          const { serverUrl, token, activeBudgetId } = activeContext();
          const { uploadBudget } = await import("./budgetfiles");
          const { groupId } = await uploadBudget(serverUrl, token, activeBudgetId);
          useBudgetContextStore.getState().setBudgetContext({ groupId });
          resolveConflict();
        }
      } catch (e) {
        emitErrorEvent(e, { operation: "syncRecovery.auto", code });
        useSyncStore.getState()._setConflict(code);
      }
      return;
    }

    case "sync/file-key-mismatch":
      // Key rotated server-side — same UX as sync/key-missing: the reopen
      // flow prompts for the new password.
      useSyncStore.getState()._setErrorCode("sync/key-missing");
      return;

    default:
      useSyncStore.getState()._setErrorCode(code);
  }
}
