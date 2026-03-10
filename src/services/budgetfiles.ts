import {
  makeDirectoryAsync,
  writeAsStringAsync,
  readAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { unzipSync, zipSync } from 'fflate';
import { randomUUID } from 'expo-crypto';
import { closeDatabase, openDatabase, run, getDb } from '../db';
import { loadClock, resetSyncState, clearSwitchingFlag, fullSync, waitForSyncToSettle } from '../sync';
import { resetAllStores } from '../stores/resetStores';
import { usePrefsStore } from '../stores/prefsStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useCategoriesStore } from '../stores/categoriesStore';
import { useBudgetStore } from '../stores/budgetStore';
import { usePayeesStore } from '../stores/payeesStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useTagsStore } from '../stores/tagsStore';
import { useSchedulesStore } from '../stores/schedulesStore';
import type { BudgetFile } from './authService';
import {
  type BudgetMetadata,
  getBudgetDir,
  readMetadata,
  writeMetadata,
  updateMetadata,
  idFromBudgetName,
  deleteBudgetDir,
} from './budgetMetadata';

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

function throwIfUnauthorized(res: Response): void {
  if (res.status === 401 || res.status === 403) {
    usePrefsStore.getState().clearAll();
    throw new Error('Session expired. Please log in again.');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
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

export type BudgetFileState = 'local' | 'remote' | 'synced' | 'detached';

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
  remote: BudgetFile[],
): ReconciledBudgetFile[] {
  const result: ReconciledBudgetFile[] = [];
  const matchedRemoteIds = new Set<string>();

  for (const loc of local) {
    const remoteMatch = remote.find(
      (r) => !r.deleted && r.fileId === loc.cloudFileId,
    );
    if (remoteMatch) {
      matchedRemoteIds.add(remoteMatch.fileId);
      result.push({
        state: 'synced',
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
        state: 'detached',
        localId: loc.id,
        cloudFileId: loc.cloudFileId,
        name: loc.budgetName,
        groupId: loc.groupId,
        lastOpened: loc.lastOpened,
      });
    } else {
      result.push({
        state: 'local',
        localId: loc.id,
        name: loc.budgetName,
        lastOpened: loc.lastOpened,
      });
    }
  }

  for (const rem of remote) {
    if (!rem.deleted && !matchedRemoteIds.has(rem.fileId)) {
      result.push({
        state: 'remote',
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
  console.log('[upload] Starting upload for budget:', budgetId);

  // 1. Switch from WAL to DELETE journal mode so the file is self-contained.
  //    sql-wasm (used by the Actual web UI) doesn't support mmap/WAL.
  //    This checkpoints any WAL data back into the main db file.
  const db = getDb();
  await db.execAsync('PRAGMA journal_mode = DELETE');
  console.log('[upload] Switched journal_mode to DELETE');

  // 2. Read the SQLite file as base64 → Uint8Array
  const dbBase64 = await readAsStringAsync(`${budgetDir}db.sqlite`, {
    encoding: EncodingType.Base64,
  });
  const dbBytes = base64ToUint8(dbBase64);
  console.log('[upload] DB file size:', dbBytes.length, 'bytes');

  // Restore WAL mode for continued local use
  await db.execAsync('PRAGMA journal_mode = WAL');

  // 2. Read metadata and set resetClock flag
  const meta = await readMetadata(budgetId);
  if (!meta) throw new Error(`No metadata for budget ${budgetId}`);
  const metaWithReset = { ...meta, resetClock: true };
  const metaBytes = new TextEncoder().encode(JSON.stringify(metaWithReset));
  console.log('[upload] Metadata:', JSON.stringify(metaWithReset));

  // 3. Create ZIP
  const zipped = zipSync({
    'db.sqlite': dbBytes,
    'metadata.json': metaBytes,
  });
  console.log('[upload] ZIP size:', zipped.length, 'bytes');

  // 4. Generate cloudFileId (alphanumeric, no dashes — server validates /^[a-zA-Z0-9_-]+$/)
  const cloudFileId = randomUUID().replace(/-/g, '');
  console.log('[upload] cloudFileId:', cloudFileId);

  // 5. Upload
  const url = `${serverUrl}/sync/upload-user-file`;
  const headers = {
    'Content-Type': 'application/encrypted-file',
    'Content-Length': String(zipped.length),
    'X-ACTUAL-TOKEN': token,
    'X-ACTUAL-FILE-ID': cloudFileId,
    'X-ACTUAL-NAME': encodeURIComponent(meta.budgetName),
    'X-ACTUAL-FORMAT': '2',
  };
  console.log('[upload] POST', url, 'headers:', JSON.stringify(headers));

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: zipped.buffer as ArrayBuffer,
  });

  console.log('[upload] Response status:', res.status);
  throwIfUnauthorized(res);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[upload] Upload failed:', res.status, text);
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  console.log('[upload] Response body:', JSON.stringify(json));

  if (json.status !== 'ok') {
    throw new Error(`Upload failed: ${JSON.stringify(json)}`);
  }

  const groupId = json.groupId as string;

  // 6. Update local metadata
  await updateMetadata(budgetId, { cloudFileId, groupId });
  console.log('[upload] Upload complete. groupId:', groupId);

  return { cloudFileId, groupId };
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
  file: BudgetFile,
): Promise<string> {
  if (file.encryptKeyId) {
    throw new Error(
      'This budget file is encrypted. Encrypted files are not yet supported.',
    );
  }

  // 1. Download ZIP
  const res = await fetch(`${serverUrl}/sync/download-user-file`, {
    headers: {
      'x-actual-token': token,
      'x-actual-file-id': file.fileId,
    },
  });

  throwIfUnauthorized(res);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Download failed (${res.status}): ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const zipBytes = new Uint8Array(buffer);

  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    const contentType = res.headers.get('content-type') ?? 'unknown';
    const preview = new TextDecoder().decode(zipBytes.slice(0, 200));
    throw new Error(
      `Server did not return a ZIP file.\nContent-Type: ${contentType}\nPreview: ${preview}`,
    );
  }

  // 2. Extract db.sqlite
  const unzipped = unzipSync(zipBytes);
  const dbBytes = unzipped['db.sqlite'];
  if (!dbBytes) {
    throw new Error('Downloaded archive does not contain db.sqlite');
  }

  // 3. Create budget directory and write files
  const budgetId = idFromBudgetName(file.name || 'budget');
  const budgetDir = getBudgetDir(budgetId);
  await makeDirectoryAsync(budgetDir, { intermediates: true });

  const dbPath = `${budgetDir}db.sqlite`;
  await writeAsStringAsync(dbPath, uint8ToBase64(dbBytes), {
    encoding: EncodingType.Base64,
  });

  // 4. Write metadata
  await writeMetadata(budgetId, {
    id: budgetId,
    budgetName: file.name || 'Unnamed budget',
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
 */
export async function openBudget(budgetId: string): Promise<void> {
  await waitForSyncToSettle();
  resetSyncState();
  resetAllStores();
  await closeDatabase();

  const budgetDir = getBudgetDir(budgetId);
  await openDatabase(budgetDir);

  // Handle resetClock flag (fresh downloads need a new node ID)
  const meta = await readMetadata(budgetId);
  if (meta?.resetClock) {
    await run('DELETE FROM messages_clock');
    await updateMetadata(budgetId, { resetClock: false });
  }

  await loadClock();

  // Load all stores from the newly opened DB
  await Promise.allSettled([
    useAccountsStore.getState().load(),
    useCategoriesStore.getState().load(),
    useBudgetStore.getState().load(),
    usePayeesStore.getState().load(),
    usePreferencesStore.getState().load(),
    useTagsStore.getState().load(),
    useSchedulesStore.getState().load(),
  ]);

  // Update global prefs with active budget info
  usePrefsStore.getState().setPrefs({
    activeBudgetId: budgetId,
    fileId: meta?.cloudFileId ?? '',
    groupId: meta?.groupId ?? '',
    encryptKeyId: meta?.encryptKeyId,
    budgetName: meta?.budgetName ?? 'Unnamed budget',
    lastSyncedTimestamp: meta?.lastSyncedTimestamp,
  });

  // Update lastOpened
  await updateMetadata(budgetId, {
    lastOpened: new Date().toISOString(),
  });

  clearSwitchingFlag();

  // Background sync for cloud-connected budgets
  if (meta?.cloudFileId && meta?.groupId) {
    fullSync().catch(console.warn);
  }
}

/** Close the currently open budget without opening another. */
export async function closeBudget(): Promise<void> {
  await waitForSyncToSettle();
  resetSyncState();
  resetAllStores();
  await closeDatabase();
  usePrefsStore.getState().setPrefs({
    activeBudgetId: '',
    fileId: '',
    groupId: '',
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

  if (file.state === 'remote' && file.cloudFileId) {
    // Need to download first
    const budgetFile: BudgetFile = {
      fileId: file.cloudFileId,
      groupId: file.groupId ?? '',
      name: file.name,
      encryptKeyId: file.encryptKeyId,
    };
    localId = await downloadBudget(serverUrl, token, budgetFile);
  }

  if (!localId) {
    throw new Error('Cannot switch budget: no local ID available');
  }

  await openBudget(localId);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete a budget's local files. Closes the budget first if it's active. */
export async function deleteBudget(budgetId: string): Promise<void> {
  const prefs = usePrefsStore.getState();
  if (prefs.activeBudgetId === budgetId) {
    await closeBudget();
  }
  await deleteBudgetDir(budgetId);
}

/** Soft-delete a budget from the server (marks deleted=true). */
export async function deleteFromServer(
  serverUrl: string,
  token: string,
  cloudFileId: string,
): Promise<void> {
  const res = await fetch(`${serverUrl}/sync/delete-user-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-actual-token': token,
    },
    body: JSON.stringify({ fileId: cloudFileId }),
  });
  throwIfUnauthorized(res);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Server delete failed (${res.status}): ${text}`);
  }
}
