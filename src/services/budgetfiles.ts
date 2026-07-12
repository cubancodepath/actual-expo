import {
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  deleteAsync,
  EncodingType,
} from "expo-file-system/legacy";
import { openDatabaseAsync } from "expo-sqlite";
import { unzipSync, zipSync } from "fflate";
import { addDays } from "date-fns";
import { randomUUID } from "expo-crypto";
import { closeDatabase, openDatabase, isDatabaseOpen } from "@/core/db";
import {
  loadClock,
  saveClock,
  resetSyncState,
  clearSwitchingFlag,
  fullSync,
  waitForSyncToSettle,
} from "@/core/sync";
import { resetAllStores } from "../stores/resetStores";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { logout } from "@/services/authService";
import type { RemoteBudgetFile } from "@/services/api/budgetFiles.api";
import {
  type BudgetMetadata,
  ensureBudgetsDir,
  getBudgetDir,
  readMetadata,
  writeMetadata,
  updateMetadata,
  idFromBudgetName,
  deleteBudgetDir,
} from "./budgetMetadata";
import { seedLocalBudget, type CategorySelection } from "./seedBudget";
import * as encryption from "@/core/encryption";
import { loadKeyForBudget } from "./encryptionService";
import { http } from "@/services/api/httpClient";
import { mapServerReason } from "@/core/post";
import { ActualError, type ErrorCode } from "@/core/errors";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

/**
 * Throws auth/token-expired (and logs out) on 401/403. On any other non-2xx,
 * reads the body: the sync server reports file-state rejections (e.g.
 * "file-has-reset") as the raw text body, which map to specific sync/file-*
 * codes; anything else falls back to `code`.
 */
async function checkResponse(res: Response, code: ErrorCode): Promise<void> {
  if (res.status === 401 || res.status === 403) {
    void logout();
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
// Helpers
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
// Types
// ---------------------------------------------------------------------------

export type BudgetFileState = "local" | "remote" | "synced" | "detached";

export type ReconciledBudgetFile = {
  state: BudgetFileState;
  localId?: string;
  cloudFileId?: string;
  name: string;
  groupId?: string;
  encryptKeyId?: string;
  ownerName?: string;
  lastOpened?: string;
};

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export function reconcileFiles(
  local: BudgetMetadata[],
  remote: RemoteBudgetFile[],
): ReconciledBudgetFile[] {
  const result: ReconciledBudgetFile[] = [];
  const matchedRemoteIds = new Set<string>();

  for (const loc of local) {
    const remoteMatch = remote.find((r) => !r.deleted && r.fileId === loc.cloudFileId);
    if (remoteMatch) {
      matchedRemoteIds.add(remoteMatch.fileId);
      result.push({
        state: "synced",
        localId: loc.id,
        cloudFileId: remoteMatch.fileId,
        name: loc.budgetName,
        groupId: loc.groupId ?? remoteMatch.groupId,
        encryptKeyId: remoteMatch.encryptKeyId,
        ownerName: remoteMatch.ownerName,
        lastOpened: loc.lastOpened,
      });
    } else if (loc.cloudFileId) {
      result.push({
        state: "detached",
        localId: loc.id,
        cloudFileId: loc.cloudFileId,
        name: loc.budgetName,
        groupId: loc.groupId,
        lastOpened: loc.lastOpened,
      });
    } else {
      result.push({
        state: "local",
        localId: loc.id,
        name: loc.budgetName,
        lastOpened: loc.lastOpened,
      });
    }
  }

  for (const rem of remote) {
    if (!rem.deleted && !matchedRemoteIds.has(rem.fileId)) {
      result.push({
        state: "remote",
        cloudFileId: rem.fileId,
        name: rem.name,
        groupId: rem.groupId,
        encryptKeyId: rem.encryptKeyId,
        ownerName: rem.ownerName,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Create a new local budget: metadata + database + CRDT clock + seed data.
 * Leaves the raw DB connection open (callers do a proper openBudget() once
 * setup finishes). Returns the new budgetId.
 */
export async function createBudget(opts: {
  budgetName: string;
  accountName: string;
  startingBalance: number;
  selectedCategories: CategorySelection;
}): Promise<string> {
  const budgetId = idFromBudgetName(opts.budgetName);
  if (__DEV__) console.log("[budgetfiles] Creating budget:", budgetId);

  await ensureBudgetsDir();
  await writeMetadata(budgetId, { id: budgetId, budgetName: opts.budgetName });
  await openDatabase(getBudgetDir(budgetId));
  await loadClock();

  await seedLocalBudget({
    accountName: opts.accountName,
    startingBalance: opts.startingBalance,
    selectedCategories: opts.selectedCategories,
  });

  return budgetId;
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
 * not-yet-due files.
 */
export async function possiblyUpload(budgetId: string): Promise<void> {
  const meta = await readMetadata(budgetId);
  if (!meta?.cloudFileId || !meta?.groupId) return;
  if (!shouldReupload(meta.lastUploaded)) return;

  const { serverUrl, token } = useSessionStore.getState();
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
    const preview = new TextDecoder().decode(zipBytes.slice(0, 200));
    throw new ActualError("file/corrupt-archive", {
      context: { contentType, preview },
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
// Open / Close
// ---------------------------------------------------------------------------

/**
 * Open an existing local budget. Closes any currently open budget first.
 *
 * Idempotent by default: if `budgetId` is already the active, open budget it
 * returns immediately. This is critical for Fast Refresh — the bootstrap effect
 * remounts and re-calls openBudget(activeBudgetId); without this guard it would
 * closeDatabase() while the previous open's spreadsheet/liveQueries/sync are
 * still in flight, crashing natively on expo.module.sqlite.AsyncQueue. Pass
 * `{ force: true }` to reopen an already-open budget (e.g. after a data reset).
 */
export async function openBudget(budgetId: string, opts?: { force?: boolean }): Promise<void> {
  const t0 = Date.now();
  const lap = (label: string) => {
    if (__DEV__) console.log(`[openBudget] ${label}: ${Date.now() - t0}ms`);
  };

  if (
    !opts?.force &&
    isDatabaseOpen(getBudgetDir(budgetId)) &&
    useBudgetContextStore.getState().activeBudgetId === budgetId
  ) {
    if (__DEV__) console.log("[openBudget] already open, skipping", budgetId);
    return;
  }

  try {
    // 1. Close previous budget — settle sync + close DB, but do NOT resetAllStores()
    // here. Resetting stores triggers immediate re-renders with empty/0 values on
    // components with EaseView (BudgetGroupHeader, etc.), causing a native SIGSEGV
    // when Fabric tries to update props on deallocating views. Instead, we let
    // the data transition happen atomically when activeBudgetId changes.
    await waitForSyncToSettle();
    resetSyncState();
    await closeDatabase();
    lap("close + reset");

    // 2. Open DB + load clock
    const budgetDir = getBudgetDir(budgetId);
    await openDatabase(budgetDir);
    let meta = await readMetadata(budgetId);
    const isFirstOpen = !!meta?.resetClock;
    await loadClock();
    lap("openDB + loadClock");

    // 3. Handle resetClock (fresh downloads need a new node ID)
    // Upstream pattern (budgetfiles/app.ts line 575): only setNode() + save clock.
    // The server will detect merkle divergence during sync and send missing messages.
    if (isFirstOpen) {
      const { makeClientId, getClock } = await import("@/core/crdt");
      getClock().timestamp.setNode(makeClientId());
      await saveClock();
      await updateMetadata(budgetId, { resetClock: false });
      meta = await readMetadata(budgetId);
      lap("resetClock");
    }

    // 4. Load synced prefs (format config, feature flags)
    const { useSyncedPrefsStore } = await import("@/hooks/useSyncedPrefs");
    await useSyncedPrefsStore.getState().load();

    // 5. Pre-fetch core queries into cache — gives instant first render with local data.
    // liveQuery takes over reactively after mount; sync updates flow through events.
    const { executeQuery } = await import("@/core/queries/execute");
    const { q } = await import("@/core/queries/query");
    const { setQueryCache, clearQueryCache } = await import("@/core/queries/queryCache");
    clearQueryCache(); // Clear old budget's stale entries before populating with new data

    const [accounts, categories, groups, payees, tags] = await Promise.all([
      executeQuery(q("accounts")),
      executeQuery(q("categories")),
      executeQuery(q("category_groups")),
      executeQuery(q("payees")),
      executeQuery(q("tags")),
    ]);
    setQueryCache(q("accounts").serializeAsString(), accounts.data);
    setQueryCache(q("categories").serializeAsString(), categories.data);
    setQueryCache(q("category_groups").serializeAsString(), groups.data);
    setQueryCache(q("payees").serializeAsString(), payees.data);
    setQueryCache(q("tags").serializeAsString(), tags.data);

    // Pre-fetch account balances + group totals in parallel
    const typedAccounts = accounts.data as Array<{
      id: string;
      offbudget: number;
      closed: number;
    }>;
    const openAccounts = typedAccounts.filter((a) => !a.closed);
    const budgetIds = openAccounts.filter((a) => !a.offbudget).map((a) => a.id);
    const offBudgetIds = openAccounts.filter((a) => a.offbudget).map((a) => a.id);

    const balanceQueries = openAccounts.map((a) => {
      const bq = q("transactions").filter({ acct: a.id }).calculate({ $sum: "$amount" });
      return executeQuery(bq).then((r) => setQueryCache(bq.serializeAsString(), r.data));
    });

    // Group totals (same query shape as useAccountGroupBalance)
    if (budgetIds.length > 0) {
      const gq = q("transactions")
        .filter({ acct: { $oneof: budgetIds } })
        .calculate({ $sum: "$amount" });
      balanceQueries.push(
        executeQuery(gq).then((r) => setQueryCache(gq.serializeAsString(), r.data)),
      );
    }
    if (offBudgetIds.length > 0) {
      const gq = q("transactions")
        .filter({ acct: { $oneof: offBudgetIds } })
        .calculate({ $sum: "$amount" });
      balanceQueries.push(
        executeQuery(gq).then((r) => setQueryCache(gq.serializeAsString(), r.data)),
      );
    }

    if (balanceQueries.length > 0) await Promise.all(balanceQueries);
    lap("pre-fetch queries");

    // 6. Initialize spreadsheet engine with local data
    const { initSpreadsheet } = await import("@/core/domain/spreadsheet/sync");
    await initSpreadsheet();
    lap("initSpreadsheet");

    // 7. Set sync-related budget context (needed for fullSync)
    useBudgetContextStore.getState().setBudgetContext({
      fileId: meta?.cloudFileId ?? "",
      groupId: meta?.groupId ?? "",
      encryptKeyId: meta?.encryptKeyId,
      lastSyncedTimestamp: meta?.lastSyncedTimestamp ?? undefined,
    });

    // 8. Update lastOpened
    await updateMetadata(budgetId, { lastOpened: new Date().toISOString() });

    // 9. Load encryption key if needed (before sync)
    if (meta?.encryptKeyId && meta?.cloudFileId && !encryption.hasKey(meta.encryptKeyId)) {
      await loadKeyForBudget(meta.cloudFileId);
    }

    // 10. Activate UI — render with local data (upstream pattern: show before sync)
    useBudgetContextStore.getState().setBudgetContext({
      activeBudgetId: budgetId,
      budgetName: meta?.budgetName ?? "Unnamed budget",
    });
    clearSwitchingFlag();

    lap("TOTAL — UI visible now");

    // Background sync (non-blocking) — reactive liveQuery updates UI when done.
    // No emit needed: useLiveQuery/usePagedLiveQuery depend on activeBudgetId,
    // so they automatically recreate and re-fetch when the budget changes.
    if (meta?.cloudFileId && meta?.groupId) {
      fullSync({ force: true }).catch((e) => {
        if (__DEV__) console.warn("[openBudget] background sync failed:", e);
      });

      // Periodic full-snapshot re-upload (non-blocking) — matches upstream
      // budgetfiles/app.ts:633, called on budget load. Without this the
      // server-side message history grows unbounded forever.
      possiblyUpload(budgetId).catch(async (e) => {
        emitErrorEvent(e, { operation: "possiblyUpload" });
        const code = toErrorCode(e);
        if (code.startsWith("sync/file-")) {
          // The 7-day re-upload hit a file-state rejection — same recovery
          // flow as a rejected /sync/sync, not a silent warn.
          const { handleSyncFileError } = await import("./syncRecovery");
          await handleSyncFileError(code);
        }
      });
    }
  } catch (error) {
    // Cleanup on failure (upstream pattern: closeBudget on error)
    await closeBudget().catch(() => {});
    throw error;
  }
}

/** Close the currently open budget without opening another. */
export async function closeBudget(): Promise<void> {
  await waitForSyncToSettle();
  resetSyncState();
  resetAllStores();
  await closeDatabase();
  useBudgetContextStore.getState().setBudgetContext({
    activeBudgetId: "",
    fileId: "",
    groupId: "",
    encryptKeyId: undefined,
    lastSyncedTimestamp: undefined,
    budgetName: undefined,
  });
}

// ---------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------

/**
 * Switch to a budget. If remote-only, downloads first. Then opens.
 */
export async function switchBudget(
  file: ReconciledBudgetFile,
  serverUrl: string,
  token: string,
): Promise<void> {
  let localId = file.localId;

  if (file.state === "remote" && file.cloudFileId) {
    // Need to download first
    const budgetFile: RemoteBudgetFile = {
      fileId: file.cloudFileId,
      groupId: file.groupId ?? "",
      name: file.name,
      encryptKeyId: file.encryptKeyId,
    };
    localId = await downloadBudget(serverUrl, token, budgetFile);
  }

  if (!localId) {
    throw new ActualError("file/switch-failed", {
      context: { reason: "no local ID available" },
    });
  }

  await openBudget(localId);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete a budget's local files. Closes the budget first if it's active. */
export async function deleteBudget(budgetId: string): Promise<void> {
  const prefs = useBudgetContextStore.getState();
  if (prefs.activeBudgetId === budgetId) {
    await closeBudget();
  }
  await deleteBudgetDir(budgetId);
}

// ---------------------------------------------------------------------------
// Convert / Re-register
// ---------------------------------------------------------------------------

/** Strip cloud identifiers, making the budget local-only. */
export async function convertToLocalOnly(budgetId: string): Promise<void> {
  await updateMetadata(budgetId, {
    cloudFileId: undefined,
    groupId: undefined,
  });
}

/**
 * Re-upload a detached budget as a new server file.
 * Clears old cloud identifiers first so uploadBudget generates fresh ones.
 */
export async function reRegisterBudget(
  serverUrl: string,
  token: string,
  budgetId: string,
): Promise<{ cloudFileId: string; groupId: string }> {
  await updateMetadata(budgetId, {
    cloudFileId: undefined,
    groupId: undefined,
  });
  return uploadBudget(serverUrl, token, budgetId);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Soft-delete a budget from the server (marks deleted=true). */
export async function deleteFromServer(
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
