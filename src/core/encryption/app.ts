import { randomUUID } from "expo-crypto";
import * as encryption from "@/core/encryption";
import { post } from "@/core/post";
import * as keyStore from "@/core/platform/keyStore";
import { base64ToUint8, uint8ToBase64 } from "@/core/encryption/base64";
import { makeTestMessage } from "@/core/sync/makeTestMessage";
import { resetSync } from "@/core/sync/reset";
import type { EncryptionContext, Ok, ServiceError } from "@/core/sync/cloudStorage";

/**
 * Encryption key handlers — port of upstream `server/encryption/app.ts`
 * (`keyMake`, `keyTest`). Same steps, order and return shapes (`{}` success /
 * `{ error: { reason } }` failure).
 *
 * Platform-forced deviations only: key persistence via `@/core/platform/keyStore`
 * (Keychain) instead of loot-core's `asyncStorage 'encrypt-keys'`; crypto is
 * @noble (byte-compatible with WebCrypto); server params passed as a context.
 *
 * Full module map + rationale for every divergence: `src/core/encryption/README.md`.
 */

export type { ErrorReason } from "@/core/sync/cloudStorage";

/**
 * Test a password against the server's key and, if valid, save it off —
 * upstream `keyTest`.
 *
 * Like upstream, the `encryptKeyId` metadata is NOT written here: this is the
 * "prefs not loaded" case (testing a key to download a file); the download/open
 * flow sets it once the budget is actually loaded.
 */
export async function keyTest({
  serverUrl,
  token,
  cloudFileId,
  password,
}: {
  serverUrl: string;
  token: string;
  cloudFileId: string;
  password: string;
}): Promise<Ok | ServiceError> {
  let res: { id: string; salt: string; test: string | null };
  try {
    res = (await post(`${serverUrl}/sync/user-get-key`, {
      token,
      fileId: cloudFileId,
    })) as { id: string; salt: string; test: string | null };
  } catch {
    return { error: { reason: "network" } };
  }

  const { id, salt, test: originalTest } = res;

  if (!originalTest) {
    return { error: { reason: "old-key-style" } };
  }

  const test: {
    value: string;
    meta: { keyId: string; algorithm: string; iv: string; authTag: string };
  } = JSON.parse(originalTest);

  const key = await encryption.createKey({ id, password, salt });
  await encryption.loadKey(key);

  try {
    await encryption.decrypt(base64ToUint8(test.value), test.meta);
  } catch {
    // Unload the key, it's invalid
    encryption.unloadKey(key);
    return { error: { reason: "decrypt-failure" } };
  }

  // Persist key for future sessions
  await keyStore.saveKey(cloudFileId, key.serialize());

  return {};
}

/**
 * Create a new key from a password and make it the file's key — upstream
 * `keyMake`. Changing the key necessitates a sync reset (clears server data so
 * there's no mix of keys), delegated to {@link resetSync}.
 */
export async function keyMake(
  ctx: EncryptionContext & { password: string },
): Promise<{ groupId?: string } | ServiceError> {
  const salt = uint8ToBase64(encryption.randomBytes(32));
  const id = randomUUID();
  const key = await encryption.createKey({ id, password: ctx.password, salt });

  // Load the key
  await encryption.loadKey(key);

  // Make test data to check whether the key is valid later
  const testContent = await makeTestMessage(key.getId());

  return resetSync(ctx, {
    key,
    salt,
    testContent: JSON.stringify({
      ...testContent,
      value: uint8ToBase64(testContent.value),
    }),
  });
}
