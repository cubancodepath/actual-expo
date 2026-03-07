import {
  documentDirectory,
  makeDirectoryAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
import { closeDatabase, openDatabase } from '../db';
import { run } from '../db';
import { loadClock, resetSyncState, clearSwitchingFlag, fullSync } from '../sync';
import { resetAllStores } from '../stores/resetStores';
import { usePrefsStore } from '../stores/prefsStore';
import { useAccountsStore } from '../stores/accountsStore';
import { useCategoriesStore } from '../stores/categoriesStore';
import { useBudgetStore } from '../stores/budgetStore';
import { usePayeesStore } from '../stores/payeesStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { useTagsStore } from '../stores/tagsStore';
import type { BudgetFile } from './authService';

/**
 * Convert a Uint8Array to a base64 string.
 * Uses btoa (available in Hermes/React Native). Processes in chunks
 * to avoid "maximum call stack" on large buffers.
 */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Download the full SQLite database from the actual-budget server,
 * replace the local database file, and reopen the connection.
 *
 * Mirrors loot-core's `download()` + `importBuffer()` in cloud-storage.ts.
 *
 * @throws if the file is encrypted (not yet supported) or the download fails.
 */
export async function downloadAndImportBudget(
  serverUrl: string,
  token: string,
  fileId: string,
  encryptKeyId?: string,
): Promise<void> {
  if (encryptKeyId) {
    throw new Error(
      'This budget file is encrypted. Encrypted files are not yet supported in the Expo app.',
    );
  }

  // 1. Download ZIP from server
  const res = await fetch(`${serverUrl}/sync/download-user-file`, {
    headers: {
      'x-actual-token': token,
      'x-actual-file-id': fileId,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Download failed (${res.status}): ${text}`);
  }

  const buffer = await res.arrayBuffer();
  const zipBytes = new Uint8Array(buffer);

  // Diagnose: log content-type and first bytes so we can see what the server sent
  const contentType = res.headers.get('content-type') ?? 'unknown';
  const firstBytes = Array.from(zipBytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`[download] content-type: ${contentType}, size: ${zipBytes.length}, first bytes: ${firstBytes}`);

  // ZIP magic bytes are 50 4b 03 04 — if it's something else, show what we got
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    const preview = new TextDecoder().decode(zipBytes.slice(0, 200));
    throw new Error(`Server did not return a ZIP file.\nContent-Type: ${contentType}\nPreview: ${preview}`);
  }

  // 2. Unzip — extract db.sqlite (matches what loot-core's AdmZip does)
  const unzipped = unzipSync(zipBytes);
  const dbBytes = unzipped['db.sqlite'];
  if (!dbBytes) {
    throw new Error('Downloaded archive does not contain db.sqlite');
  }

  // 3. Close existing DB connection before replacing the file
  await closeDatabase();

  // 4. Write new db file to the Expo SQLite directory
  const sqliteDir = `${documentDirectory}SQLite`;
  await makeDirectoryAsync(sqliteDir, { intermediates: true });
  const dbPath = `${sqliteDir}/actual.db`;
  await writeAsStringAsync(dbPath, uint8ToBase64(dbBytes), {
    encoding: EncodingType.Base64,
  });

  // 5. Reopen DB with the downloaded schema
  await openDatabase();

  // 6. Reset CRDT clock so this device gets a fresh node ID
  //    (mirrors loot-core's resetClock logic in importBuffer)
  await run('DELETE FROM messages_clock');
  await loadClock();
}

/**
 * Switch to a different budget file. Handles the full lifecycle:
 * invalidate in-flight syncs → reset stores → download & import →
 * reload stores → update prefs → trigger initial sync.
 */
export async function switchBudget(
  serverUrl: string,
  token: string,
  file: BudgetFile,
): Promise<void> {
  resetSyncState();
  resetAllStores();

  await downloadAndImportBudget(serverUrl, token, file.fileId, file.encryptKeyId);

  await Promise.allSettled([
    useAccountsStore.getState().load(),
    useCategoriesStore.getState().load(),
    useBudgetStore.getState().load(),
    usePayeesStore.getState().load(),
    usePreferencesStore.getState().load(),
    useTagsStore.getState().load(),
  ]);

  usePrefsStore.getState().setPrefs({
    fileId: file.fileId,
    groupId: file.groupId,
    encryptKeyId: file.encryptKeyId,
    budgetName: file.name || 'Unnamed budget',
    lastSyncedTimestamp: undefined,
  });

  clearSwitchingFlag();
  fullSync().catch(console.warn);
}

