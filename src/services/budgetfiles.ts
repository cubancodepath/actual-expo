import {
  documentDirectory,
  makeDirectoryAsync,
  writeAsStringAsync,
  EncodingType,
} from 'expo-file-system/legacy';
import { deleteDatabaseAsync } from 'expo-sqlite';
import { unzipSync, zipSync } from 'fflate';
import { randomUUID } from 'expo-crypto';
import { closeDatabase, openDatabase, getDb } from '../db';
import { run } from '../db';
import { loadClock } from '../sync';

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
 * Create a brand-new, empty budget on the server.
 *
 * Mirrors the desktop "Create new file" flow:
 *   1. Reinitialize local SQLite (fresh schema, no data)
 *   2. ZIP the empty db.sqlite using fflate
 *   3. POST /sync/upload-user-file → server assigns groupId
 *   4. Return { fileId, groupId } so caller can set prefs and connect
 */
export async function createNewBudget(
  serverUrl: string,
  token: string,
  name: string,
): Promise<{ fileId: string; groupId: string }> {
  // 1. Release DB lock and delete the database file (handles WAL/SHM cleanup too)
  await closeDatabase();
  try {
    await deleteDatabaseAsync('actual.db');
  } catch {
    // Database may not exist yet on first run — that's fine
  }

  // 2. Reopen with a fresh, empty schema
  await openDatabase();

  // 3. Fresh CRDT clock for this device
  await loadClock();

  // 4. Serialize the database directly to bytes — no file path needed.
  //    Uses sqlite3_serialize under the hood, which includes a WAL checkpoint.
  const dbBytes = await getDb().serializeAsync();

  // 5. Wrap in a ZIP the same way the desktop client does
  const zipped = zipSync({ 'db.sqlite': dbBytes });

  // 6. Generate a new fileId — alphanumeric only to satisfy server's isValidFileId check
  const fileId = randomUUID().replace(/-/g, '');

  // 7. Upload to server — no groupId header means this is a brand new file
  const res = await fetch(`${serverUrl}/sync/upload-user-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/encrypted-file',
      'x-actual-token': token,
      'x-actual-file-id': fileId,
      'x-actual-name': encodeURIComponent(name),
      'x-actual-format': '2',
    },
    body: zipped,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to create budget (${res.status}): ${text}`);
  }

  const json = await res.json() as { status: string; groupId?: string };
  if (json.status !== 'ok' || !json.groupId) {
    throw new Error(`Unexpected server response: ${JSON.stringify(json)}`);
  }

  return { fileId, groupId: json.groupId };
}
