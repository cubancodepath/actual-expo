import { post } from "@/core/post";
import * as encryption from "@/core/server/encryption";

/**
 * Cloud-storage protocol helpers — port of upstream `server/cloud-storage.ts`
 * (`checkKey`, `resetSyncState`). Pure: only `@/core/post` + `@/core/server/encryption`.
 *
 * The server params aren't globally available (no loot-core `prefs`), so they're
 * passed explicitly as an {@link EncryptionContext}.
 */

export type Key = Awaited<ReturnType<typeof encryption.createKey>>;

export type EncryptionContext = {
  serverUrl: string;
  token: string;
  cloudFileId: string;
  budgetId: string;
};

export type ErrorReason =
  | "network"
  | "decrypt-failure"
  | "old-key-style"
  | "file-has-new-key"
  | "upload-failure";

export type ServiceError = { error: { reason: ErrorReason } };
export type Ok = Record<string, never>;

export type KeyState = { key: Key; salt: string; testContent: string };

export type CheckKeyResult =
  | { valid: true }
  | { valid: false; error: { reason: "network" | "key-mismatch" } };

/**
 * Verify the locally-configured key still matches the server's current key for
 * this file — upstream `cloud-storage.ts::checkKey`. A peer rotating the key
 * otherwise only surfaces as a generic "decrypt-failure" on the next sync; this
 * lets the caller detect the mismatch proactively.
 */
export async function checkKey({
  serverUrl,
  token,
  cloudFileId,
  encryptKeyId,
}: {
  serverUrl: string;
  token: string;
  cloudFileId: string;
  encryptKeyId: string | null | undefined;
}): Promise<CheckKeyResult> {
  let res: { id: string | null };
  try {
    res = (await post(`${serverUrl}/sync/user-get-key`, {
      token,
      fileId: cloudFileId,
    })) as { id: string | null };
  } catch {
    return { valid: false, error: { reason: "network" } };
  }

  // Loose comparison is intentional — both sides can be null/undefined for an
  // unencrypted file (matches upstream's `res.id == encryptKeyId`).
  // eslint-disable-next-line eqeqeq
  const idMatches = res.id == encryptKeyId;
  const keyLoaded = encryptKeyId == null || encryption.hasKey(encryptKeyId);

  return idMatches && keyLoaded
    ? { valid: true }
    : { valid: false, error: { reason: "key-mismatch" } };
}

/**
 * Reset the server's file state, optionally installing a new key —
 * upstream `cloud-storage.ts::resetSyncState`.
 */
export async function resetSyncState(
  ctx: EncryptionContext,
  newKeyState?: KeyState,
): Promise<Ok | ServiceError> {
  try {
    await post(`${ctx.serverUrl}/sync/reset-user-file`, {
      token: ctx.token,
      fileId: ctx.cloudFileId,
    });
  } catch {
    return { error: { reason: "network" } };
  }

  if (newKeyState) {
    try {
      await post(`${ctx.serverUrl}/sync/user-create-key`, {
        token: ctx.token,
        fileId: ctx.cloudFileId,
        keyId: newKeyState.key.getId(),
        keySalt: newKeyState.salt,
        testContent: newKeyState.testContent,
      });
    } catch {
      return { error: { reason: "network" } };
    }
  }

  return {};
}
