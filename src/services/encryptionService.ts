import { randomUUID } from "expo-crypto";
import * as encryption from "../encryption";
import * as keyStorage from "./encryptionKeyStorage";
import { post } from "../post";
import { Message, type IMessage } from "../proto";
import { getDb } from "../db";
import { loadClock } from "../sync";

type KeyTestSuccess = { success: true };
type KeyTestError = { error: "network" | "decrypt-failure" | "old-key-style" };
export type KeyTestResult = KeyTestSuccess | KeyTestError;

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Test an encryption password against the server's stored key metadata.
 * On success, the derived key is loaded into memory and persisted in SecureStore.
 */
export async function testKey({
  serverUrl,
  token,
  cloudFileId,
  password,
}: {
  serverUrl: string;
  token: string;
  cloudFileId: string;
  password: string;
}): Promise<KeyTestResult> {
  let res: { id: string; salt: string; test: string | null };
  try {
    res = (await post(`${serverUrl}/sync/user-get-key`, {
      token,
      fileId: cloudFileId,
    })) as { id: string; salt: string; test: string | null };
  } catch {
    return { error: "network" };
  }

  const { id, salt, test: testStr } = res;

  if (!testStr) {
    return { error: "old-key-style" };
  }

  const test: {
    value: string;
    meta: { keyId: string; algorithm: string; iv: string; authTag: string };
  } = JSON.parse(testStr);

  const key = await encryption.createKey({ id, password, salt });
  await encryption.loadKey(key);

  try {
    await encryption.decrypt(base64ToUint8(test.value), test.meta);
  } catch {
    // Key is invalid — unload it
    encryption.unloadKey(key);
    return { error: "decrypt-failure" };
  }

  // Key is valid — persist for future sessions
  await keyStorage.saveKey(cloudFileId, key.serialize());

  return { success: true };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Create a random encrypted protobuf Message for key validation.
 * The server stores this so clients can verify a password is correct.
 */
async function makeTestMessage(keyId: string) {
  const randomStr = () => uint8ToBase64(encryption.randomBytes(12));
  const msg: IMessage = {
    dataset: randomStr(),
    row: randomStr(),
    column: randomStr(),
    value: randomStr(),
  };
  const msgBytes = Message.encodeToBinary(msg);
  return encryption.encrypt(msgBytes, keyId);
}

export type EnableEncryptionResult =
  | { success: true; groupId: string }
  | { error: "network" | "upload-failure" };

/**
 * Enable E2E encryption on the currently open budget.
 * Derives a new key, resets sync state, uploads the key to the server,
 * cleans local CRDT data, and re-uploads the budget.
 */
export async function enableEncryption({
  serverUrl,
  token,
  cloudFileId,
  budgetId,
  password,
}: {
  serverUrl: string;
  token: string;
  cloudFileId: string;
  budgetId: string;
  password: string;
}): Promise<EnableEncryptionResult> {
  // 1. Generate salt and key
  const salt = uint8ToBase64(encryption.randomBytes(32));
  const id = randomUUID();
  const key = await encryption.createKey({ id, password, salt });
  await encryption.loadKey(key);

  // 2. Create test message for password validation
  const testContent = await makeTestMessage(key.getId());
  const testContentJson = JSON.stringify({
    ...testContent,
    value: uint8ToBase64(testContent.value),
  });

  // 3. Reset sync state on server
  try {
    await post(`${serverUrl}/sync/reset-user-file`, {
      token,
      fileId: cloudFileId,
    });
  } catch {
    encryption.unloadKey(key);
    return { error: "network" };
  }

  // 4. Upload encryption key metadata to server
  try {
    await post(`${serverUrl}/sync/user-create-key`, {
      token,
      fileId: cloudFileId,
      keyId: key.getId(),
      keySalt: salt,
      testContent: testContentJson,
    });
  } catch {
    encryption.unloadKey(key);
    return { error: "network" };
  }

  // 5. Clean local sync state
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

  // 6. Persist key locally
  await keyStorage.saveKey(cloudFileId, key.serialize());

  // 7. Update metadata
  const { updateMetadata } = await import("./budgetMetadata");
  await updateMetadata(budgetId, {
    encryptKeyId: key.getId(),
    groupId: undefined,
    lastSyncedTimestamp: undefined,
  });

  // 8. Re-upload budget (gets a new groupId)
  try {
    const { uploadBudget } = await import("./budgetfiles");
    const { groupId } = await uploadBudget(serverUrl, token, budgetId);
    return { success: true, groupId };
  } catch (e) {
    if (__DEV__) console.error("[encryption] Upload failed after enabling encryption:", e);
    return { error: "upload-failure" };
  }
}

/**
 * Try to load a persisted key for a budget into the in-memory registry.
 * Returns true if the key was found and loaded.
 */
export async function loadKeyForBudget(cloudFileId: string): Promise<boolean> {
  if (!cloudFileId) return false;
  const stored = await keyStorage.getKey(cloudFileId);
  if (!stored) return false;

  // Only load if not already in memory
  if (!encryption.hasKey(stored.id)) {
    await encryption.loadKey(stored);
  }
  return true;
}

/**
 * Load all persisted encryption keys into memory.
 * Called once during app bootstrap.
 */
export async function loadAllPersistedKeys(): Promise<void> {
  const allKeys = await keyStorage.getAllKeys();
  for (const key of Object.values(allKeys)) {
    if (!encryption.hasKey(key.id)) {
      await encryption.loadKey(key);
    }
  }
}
