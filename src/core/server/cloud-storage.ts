// Cloud file transport — the mobile analogue of upstream's
// `loot-core/src/server/cloud-storage.ts`. Pure core: reaches the network only
// through `@/core/platform/fetch`, the filesystem through `@/core/platform/fs`,
// sqlite through `@/core/platform/sqlite`, and randomness through
// `@/core/platform/crypto`. It only THROWS typed ActualErrors — like upstream's
// checkHTTPStatus it surfaces `auth/token-expired` and never performs the
// UI logout itself (the app layer, via react-query's global onError, does that).
import { z } from "zod";
import { addDays } from "date-fns";
import { unzipSync, zipSync } from "fflate";
import {
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
  EncodingType,
} from "@/core/platform/fs";
import { openDatabaseAsync } from "@/core/platform/sqlite";
import { randomUUID } from "@/core/platform/crypto";
import { http, toTransportError, parseResponse } from "@/core/platform/fetch";
import { mapServerReason } from "@/core/post";
import { ActualError, type ErrorCode } from "@/core/errors";
import * as encryption from "@/core/encryption";
import {
  getBudgetDir,
  readMetadata,
  writeMetadata,
  updateMetadata,
  idFromBudgetName,
} from "@/core/server/prefs";

// ---------------------------------------------------------------------------
// Response guard
// ---------------------------------------------------------------------------

/**
 * Mirrors upstream cloud-storage `checkHTTPStatus`: on 401/403 the transport
 * layer only THROWS `auth/token-expired` — the logout (store/token reset) is the
 * app layer's job (react-query global onError), keeping core free of UI-state
 * side effects. Other non-2xx map the sync server's raw-text file-state reason
 * (e.g. "file-has-reset") to a `sync/file-*` code, falling back to `code`.
 */
async function checkResponse(res: Response, code: ErrorCode): Promise<void> {
  if (res.status === 401 || res.status === 403) {
    throw new ActualError("auth/token-expired");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const mapped = mapServerReason(text);
    throw new ActualError(mapped ?? code, {
      context: { status: res.status, body: text.slice(0, 200) },
    });
  }
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Remote file listing
// ---------------------------------------------------------------------------

export type RemoteBudgetFile = {
  fileId: string;
  groupId: string;
  name: string;
  encryptKeyId?: string;
  deleted?: boolean;
  ownerName?: string;
};

const RemoteBudgetFileSchema = z.looseObject({
  fileId: z.string().optional(),
  id: z.string().optional(),
  groupId: z.string().optional(),
  name: z.string().optional(),
  encryptKeyId: z.string().nullish(),
  deleted: z.union([z.boolean(), z.number()]).optional(),
  usersWithAccess: z
    .array(
      z.looseObject({
        // SQLite-backed servers may serialize this boolean as 0/1 (older
        // sync-server versions), so accept both forms like `deleted` above.
        owner: z.union([z.boolean(), z.number()]).optional(),
        displayName: z.string().optional(),
      }),
    )
    .optional(),
});

const RemoteBudgetFilesResponseSchema = z.array(RemoteBudgetFileSchema);

function filesPayload(json: unknown): unknown {
  const body = json as { data?: unknown; files?: unknown } | null;
  if (Array.isArray(body?.data)) return body.data;
  return (body?.data as { files?: unknown } | undefined)?.files ?? body?.files ?? [];
}

/** List the budget files available on the server (upstream `listRemoteFiles`). */
export async function getRemoteFiles(
  serverUrl: string,
  token: string,
): Promise<RemoteBudgetFile[]> {
  let json: unknown;
  try {
    json = await http
      .get(`${serverUrl}/sync/list-user-files`, { headers: { "x-actual-token": token } })
      .json();
  } catch (e) {
    const mapped = toTransportError(e);
    throw mapped.code === "auth/unauthorized" ? new ActualError("auth/token-expired") : mapped;
  }

  return parseResponse(RemoteBudgetFilesResponseSchema, filesPayload(json)).map((file) => ({
    fileId: (file.fileId ?? file.id)!,
    groupId: file.groupId!,
    name: file.name!,
    encryptKeyId: file.encryptKeyId ?? undefined,
    deleted: file.deleted === 1 || file.deleted === true,
    ownerName: file.usersWithAccess?.find((user) => user.owner === 1 || user.owner === true)
      ?.displayName,
  }));
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Upload a local budget to the server for the first time.
 * Creates a ZIP with db.sqlite + metadata.json, POSTs to /sync/upload-user-file.
 * Returns the server-assigned groupId.
 */
export async function uploadBudget(
  serverUrl: string,
  token: string,
  budgetId: string,
): Promise<{ cloudFileId: string; groupId: string }> {
  const budgetDir = getBudgetDir(budgetId);
  if (__DEV__) console.log("[upload] Starting upload for budget:", budgetId);

  // 1. Snapshot via sqlite3_serialize (backup API under the hood): a
  // consistent image of the db with no VACUUM involved — VACUUM demands
  // "no other SQL statements in progress" on its connection and kept
  // failing under expo-sqlite even from a dedicated connection. Serialize
  // has no such restriction and tolerates concurrent statements.
  const srcDb = await openDatabaseAsync("db.sqlite", { useNewConnection: true }, budgetDir);
  let snapshot: Uint8Array;
  try {
    snapshot = await srcDb.serializeAsync();
  } finally {
    await srcDb.closeAsync();
  }
  if (__DEV__) console.log("[upload] Serialized snapshot:", snapshot.length, "bytes");

  // 2. Write the snapshot to a temp file so we can strip kvcache/kvcache_key
  // with SQL (matches upstream cloud-storage.ts's exportBuffer(): never
  // upload the query cache — it forces new downloads to recompute
  // everything, which is safer), and flip it out of WAL so the upload is a
  // standalone file.
  const tempName = `upload-${randomUUID()}.sqlite`;
  const tempPath = `${budgetDir}${tempName}`;
  let dbBytes: Uint8Array;
  try {
    await writeAsStringAsync(tempPath, uint8ToBase64(snapshot), {
      encoding: EncodingType.Base64,
    });
    const tempDb = await openDatabaseAsync(tempName, { useNewConnection: true }, budgetDir);
    try {
      await tempDb.execAsync("PRAGMA journal_mode = DELETE");
      await tempDb.execAsync("DELETE FROM kvcache; DELETE FROM kvcache_key;");
    } finally {
      await tempDb.closeAsync();
    }
    if (__DEV__) console.log("[upload] kvcache stripped, reading snapshot file");

    const dbBase64 = await readAsStringAsync(tempPath, {
      encoding: EncodingType.Base64,
    });
    dbBytes = base64ToUint8(dbBase64);
  } finally {
    await deleteAsync(tempPath, { idempotent: true });
    // The temp db may leave -wal/-shm siblings from before the journal flip
    await deleteAsync(`${tempPath}-wal`, { idempotent: true });
    await deleteAsync(`${tempPath}-shm`, { idempotent: true });
  }

  // 3. Read metadata and set resetClock flag
  const meta = await readMetadata(budgetId);
  if (!meta) throw new Error(`No metadata for budget ${budgetId}`);
  const metaWithReset = { ...meta, resetClock: true };
  const metaBytes = new TextEncoder().encode(JSON.stringify(metaWithReset));

  // 4. Create ZIP
  const zipped = zipSync({
    "db.sqlite": dbBytes,
    "metadata.json": metaBytes,
  });
  if (__DEV__) console.log("[upload] ZIP size:", zipped.length, "bytes");

  // 5. Reuse existing cloudFileId or generate a new one
  const cloudFileId = meta.cloudFileId || randomUUID().replace(/-/g, "");
  if (__DEV__) console.log("[upload] cloudFileId:", cloudFileId);

  // 6. Encrypt ZIP if encryption key is available
  let uploadContent: Uint8Array = zipped;
  let encryptMeta: {
    keyId: string;
    algorithm: string;
    iv: string;
    authTag: string;
  } | null = null;

  if (meta.encryptKeyId && encryption.hasKey(meta.encryptKeyId)) {
    const encrypted = await encryption.encrypt(zipped, meta.encryptKeyId);
    uploadContent = encrypted.value;
    encryptMeta = encrypted.meta;
    if (__DEV__) console.log("[upload] Encrypted ZIP, size:", uploadContent.length);
  }

  // 7. Upload
  const url = `${serverUrl}/sync/upload-user-file`;
  const headers: Record<string, string> = {
    "Content-Type": "application/encrypted-file",
    "Content-Length": String(uploadContent.length),
    "X-ACTUAL-TOKEN": token,
    "X-ACTUAL-FILE-ID": cloudFileId,
    "X-ACTUAL-NAME": encodeURIComponent(meta.budgetName),
    "X-ACTUAL-FORMAT": "2",
  };
  if (encryptMeta) {
    headers["X-ACTUAL-ENCRYPT-META"] = JSON.stringify(encryptMeta);
    if (__DEV__) console.log("[upload] Encrypt meta:", JSON.stringify(encryptMeta));
  }
  if (meta.groupId) {
    headers["X-ACTUAL-GROUP-ID"] = meta.groupId;
  }

  const res = await http.post(url, {
    headers,
    body: uploadContent.buffer as ArrayBuffer,
    timeout: false,
    retry: 0,
    throwHttpErrors: false,
  });

  await checkResponse(res, "file/upload-failed");

  const json = await res.json<{ status: string; groupId: string }>();
  if (json.status !== "ok") {
    throw new ActualError("file/upload-failed", { context: { body: json } });
  }

  const groupId = json.groupId;

  // 8. Update local metadata
  await updateMetadata(budgetId, {
    cloudFileId,
    groupId,
    lastUploaded: new Date().toISOString(),
  });
  if (__DEV__) console.log("[upload] Upload complete. groupId:", groupId);

  return { cloudFileId, groupId };
}

export const UPLOAD_FREQUENCY_IN_DAYS = 7;

/**
 * Pure decision function for possiblyUpload() below — separated out so the
 * threshold logic is unit-testable without mocking file/network I/O.
 * Mirrors upstream cloud-storage.ts::possiblyUpload's date check.
 */
export function shouldReupload(lastUploaded: string | undefined, now: Date = new Date()): boolean {
  if (!lastUploaded) return true;
  const threshold = addDays(new Date(lastUploaded), UPLOAD_FREQUENCY_IN_DAYS);
  return now >= threshold;
}

/**
 * Re-upload a full snapshot if it's been more than UPLOAD_FREQUENCY_IN_DAYS
 * since the last one (upstream cloud-storage.ts::possiblyUpload, called on
 * every budget load). Without this the server's message history for a file
 * grows unbounded forever — periodic full-snapshot re-uploads let the
 * server compact it. No-op for local-only, never-cloud-registered, or
 * not-yet-due files. Server credentials are passed in (core stays store-free).
 */
export async function possiblyUpload(
  serverUrl: string,
  token: string,
  budgetId: string,
): Promise<void> {
  const meta = await readMetadata(budgetId);
  if (!meta?.cloudFileId || !meta?.groupId) return;
  if (!shouldReupload(meta.lastUploaded)) return;
  if (!serverUrl || !token) return;

  await uploadBudget(serverUrl, token, budgetId);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Download a budget from the server and save it to a new local directory.
 * Returns the local budgetId. Does NOT open the budget.
 */
export async function downloadBudget(
  serverUrl: string,
  token: string,
  file: RemoteBudgetFile,
): Promise<string> {
  // 1. Download file and file info in parallel
  const [res, infoRes] = await Promise.all([
    http.get(`${serverUrl}/sync/download-user-file`, {
      headers: { "x-actual-token": token, "x-actual-file-id": file.fileId },
      timeout: false,
      retry: 0,
      throwHttpErrors: false,
    }),
    http.get(`${serverUrl}/sync/get-user-file-info`, {
      headers: { "x-actual-token": token, "x-actual-file-id": file.fileId },
      timeout: false,
      retry: 0,
      throwHttpErrors: false,
    }),
  ]);

  await checkResponse(res, "file/download-failed");

  const rawBuffer = await res.arrayBuffer();
  let zipBytes = new Uint8Array(rawBuffer);

  // If encrypted, decrypt the file before unzipping
  type EncryptMeta = {
    keyId: string;
    algorithm: string;
    iv: string;
    authTag: string;
  };
  const fileInfo = infoRes.ok
    ? await infoRes.json<{ data?: { encryptMeta?: EncryptMeta } }>().catch(() => null)
    : null;
  const encryptMeta = fileInfo?.data?.encryptMeta;
  if (encryptMeta) {
    try {
      const decrypted = await encryption.decrypt(zipBytes, encryptMeta);
      zipBytes = new Uint8Array(decrypted);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw msg === "missing-key"
        ? new ActualError("sync/key-missing")
        : new ActualError("sync/decrypt-failure", { cause: e });
    }
  }

  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    const contentType = res.headers.get("content-type") ?? "unknown";
    const firstBytesHex = Array.from(zipBytes.slice(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    throw new ActualError("file/corrupt-archive", {
      context: { contentType, byteLength: zipBytes.length, firstBytesHex },
    });
  }

  // 2. Extract db.sqlite
  const unzipped = unzipSync(zipBytes);
  const dbBytes = unzipped["db.sqlite"];
  if (!dbBytes) {
    throw new ActualError("file/corrupt-archive", {
      context: { reason: "missing db.sqlite" },
    });
  }

  // 3. Create budget directory and write files
  const budgetId = idFromBudgetName(file.name || "budget");
  const budgetDir = getBudgetDir(budgetId);
  await makeDirectoryAsync(budgetDir, { intermediates: true });

  const dbPath = `${budgetDir}db.sqlite`;
  await writeAsStringAsync(dbPath, uint8ToBase64(dbBytes), {
    encoding: EncodingType.Base64,
  });

  // 4. Write metadata
  await writeMetadata(budgetId, {
    id: budgetId,
    budgetName: file.name || "Unnamed budget",
    cloudFileId: file.fileId,
    groupId: file.groupId,
    encryptKeyId: file.encryptKeyId,
    resetClock: true,
  });

  return budgetId;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Soft-delete a budget from the server (marks deleted=true). */
export async function removeFile(
  serverUrl: string,
  token: string,
  cloudFileId: string,
): Promise<void> {
  const res = await http.post(`${serverUrl}/sync/delete-user-file`, {
    json: { fileId: cloudFileId },
    headers: { "x-actual-token": token },
    timeout: false,
    retry: 0,
    throwHttpErrors: false,
  });
  await checkResponse(res, "file/delete-failed");
}
