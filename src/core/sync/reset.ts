import { getDb } from "@/core/db";
import * as encryption from "@/core/encryption";
import { loadClock } from "./clock";
import {
  checkKey,
  resetSyncState,
  type EncryptionContext,
  type KeyState,
  type ServiceError,
} from "./cloudStorage";

/**
 * Wipe the local CRDT sync state so the current database contents become a
 * fresh baseline (upstream loot-core/src/server/sync/reset.ts): deletes the
 * message log + clock and purges tombstoned rows, then loads a fresh clock
 * (missing row → new node id). Used before re-uploading the file as the new
 * server truth (sync reset, enabling encryption).
 */
export async function clearLocalSyncState(): Promise<void> {
  const db = getDb();
  await db.execAsync(`
    DELETE FROM messages_crdt;
    DELETE FROM messages_clock;
    DELETE FROM transactions WHERE tombstone = 1;
    DELETE FROM accounts WHERE tombstone = 1;
    DELETE FROM payees WHERE tombstone = 1;
    DELETE FROM categories WHERE tombstone = 1;
    DELETE FROM category_groups WHERE tombstone = 1;
    DELETE FROM schedules WHERE tombstone = 1;
    DELETE FROM rules WHERE tombstone = 1;
  `);
  await loadClock();
}

/**
 * Reset sync — upstream `sync/reset.ts::resetSync`. Resets the server file
 * (optionally with a new key), wipes local CRDT state, clears sync prefs,
 * persists the new key, and re-uploads the file as the "true" version.
 *
 * Returns the new `groupId` on success (mobile updates the budget context with
 * it directly, where upstream reloads the files list). Metadata + upload are the
 * only impure edges — reached by dynamic import of services, the same port
 * compromise `fullSync` uses (metadata.json / native upload have no core home).
 */
export async function resetSync(
  ctx: EncryptionContext,
  keyState?: KeyState,
): Promise<{ groupId?: string } | ServiceError> {
  const { updateMetadata, readMetadata } = await import("@/services/budgetMetadata");
  const { saveKey } = await import("@/core/platform/keyStore");

  if (!keyState) {
    // Not resetting the key — make sure ours is current so we don't upload a
    // file encrypted with the wrong key (or unencrypted).
    const encryptKeyId = (await readMetadata(ctx.budgetId))?.encryptKeyId;
    const check = await checkKey({
      serverUrl: ctx.serverUrl,
      token: ctx.token,
      cloudFileId: ctx.cloudFileId,
      encryptKeyId,
    });
    if (!check.valid) {
      return {
        error: { reason: check.error.reason === "network" ? "network" : "file-has-new-key" },
      };
    }
  }

  const reset = await resetSyncState(ctx, keyState);
  if ("error" in reset) {
    if (keyState) encryption.unloadKey(keyState.key);
    return reset;
  }

  // Wipe local CRDT state so the current db becomes the fresh baseline.
  await clearLocalSyncState();

  await updateMetadata(ctx.budgetId, {
    groupId: undefined,
    lastSyncedTimestamp: undefined,
    lastUploaded: undefined,
  });

  if (keyState) {
    // The key changed — persist it and record its id.
    await saveKey(ctx.cloudFileId, keyState.key.serialize());
    await updateMetadata(ctx.budgetId, { encryptKeyId: keyState.key.getId() });
  }

  // Upload the file to make it the "true" version other clients pull down.
  try {
    const { uploadBudget } = await import("@/services/budgetfiles");
    const { groupId } = await uploadBudget(ctx.serverUrl, ctx.token, ctx.budgetId);
    await updateMetadata(ctx.budgetId, { groupId });
    return { groupId };
  } catch (e) {
    if (__DEV__) console.error("[encryption] Upload failed after key reset:", e);
    return { error: { reason: "upload-failure" } };
  }
}
