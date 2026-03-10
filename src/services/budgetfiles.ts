import {
  makeDirectoryAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
import { closeDatabase, openDatabase, run } from '../db';
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

export async function deleteBudget(budgetId: string): Promise<void> {
  const prefs = usePrefsStore.getState();
  if (prefs.activeBudgetId === budgetId) {
    await closeBudget();
  }
  await deleteBudgetDir(budgetId);
}
