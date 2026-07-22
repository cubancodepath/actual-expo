// Local budget metadata (metadata.json) — the mobile analogue of upstream's
// `loot-core/src/server/prefs`. Pure core: reaches the filesystem only through
// `@/core/platform/fs` and randomness through `@/core/platform/crypto`, and it
// only THROWS typed ActualErrors (the error bus is app-level — the react-query
// caches and UI callers surface these).
import {
  documentDirectory,
  readDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
} from "@/core/platform/fs";
import { randomUUID } from "@/core/platform/crypto";
import { ActualError, type ErrorCode } from "@/core/errors";

// ---------------------------------------------------------------------------
// Constants & path helpers
// ---------------------------------------------------------------------------

export const BUDGETS_DIR = `${documentDirectory}budgets/`;

export function getBudgetDir(budgetId: string): string {
  return `${BUDGETS_DIR}${budgetId}/`;
}

export function getMetadataPath(budgetId: string): string {
  return `${BUDGETS_DIR}${budgetId}/metadata.json`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BudgetMetadata = {
  id: string;
  budgetName: string;
  cloudFileId?: string;
  groupId?: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  resetClock?: boolean;
  lastOpened?: string;
  /** ISO date of the last full-snapshot re-upload — see cloud-storage.ts::possiblyUpload. */
  lastUploaded?: string;
};

function storageError(
  error: unknown,
  code: ErrorCode,
  operation: string,
  context?: Record<string, unknown>,
): ActualError {
  return new ActualError(code, { cause: error, context: { operation, ...context } });
}

// ---------------------------------------------------------------------------
// Directory management
// ---------------------------------------------------------------------------

export async function ensureBudgetsDir(): Promise<void> {
  try {
    const info = await getInfoAsync(BUDGETS_DIR);
    if (!info.exists) {
      await makeDirectoryAsync(BUDGETS_DIR, { intermediates: true });
    }
  } catch (error) {
    throw storageError(error, "storage/write-failed", "ensureBudgetsDir", { path: BUDGETS_DIR });
  }
}

export async function budgetExists(budgetId: string): Promise<boolean> {
  const path = getMetadataPath(budgetId);
  try {
    const info = await getInfoAsync(path);
    return info.exists;
  } catch (error) {
    throw storageError(error, "storage/read-failed", "budgetExists", { budgetId, path });
  }
}

export async function deleteBudgetDir(budgetId: string): Promise<void> {
  const path = getBudgetDir(budgetId);
  try {
    await deleteAsync(path, { idempotent: true });
  } catch (error) {
    throw storageError(error, "storage/delete-failed", "deleteBudgetDir", { budgetId, path });
  }
}

// ---------------------------------------------------------------------------
// Metadata CRUD
// ---------------------------------------------------------------------------

export async function readMetadata(budgetId: string): Promise<BudgetMetadata | null> {
  const path = getMetadataPath(budgetId);
  let raw: string;
  try {
    const info = await getInfoAsync(path);
    if (!info.exists) return null;
    raw = await readAsStringAsync(path);
  } catch (error) {
    throw storageError(error, "storage/read-failed", "readMetadata", { budgetId, path });
  }

  try {
    return JSON.parse(raw) as BudgetMetadata;
  } catch (error) {
    throw storageError(error, "storage/corrupt-data", "readMetadata.parse", { budgetId, path });
  }
}

export async function writeMetadata(budgetId: string, meta: BudgetMetadata): Promise<void> {
  const dir = getBudgetDir(budgetId);
  const path = getMetadataPath(budgetId);
  try {
    await makeDirectoryAsync(dir, { intermediates: true });
    await writeAsStringAsync(path, JSON.stringify(meta, null, 2));
  } catch (error) {
    throw storageError(error, "storage/write-failed", "writeMetadata", { budgetId, path });
  }
}

export async function updateMetadata(
  budgetId: string,
  patch: Partial<BudgetMetadata>,
): Promise<void> {
  const existing = await readMetadata(budgetId);
  if (!existing) throw new Error(`No metadata found for budget ${budgetId}`);
  await writeMetadata(budgetId, { ...existing, ...patch });
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function getBudgets(): Promise<BudgetMetadata[]> {
  let entries: string[];
  try {
    const info = await getInfoAsync(BUDGETS_DIR);
    if (!info.exists) return [];
    entries = await readDirectoryAsync(BUDGETS_DIR);
  } catch (error) {
    throw storageError(error, "storage/read-failed", "getBudgets", { path: BUDGETS_DIR });
  }
  const budgets: BudgetMetadata[] = [];

  for (const entry of entries) {
    const meta = await readMetadata(entry).catch(() => null);
    if (meta) budgets.push(meta);
  }

  // Sort by lastOpened descending (most recent first)
  budgets.sort((a, b) => {
    if (!a.lastOpened) return 1;
    if (!b.lastOpened) return -1;
    return b.lastOpened.localeCompare(a.lastOpened);
  });

  return budgets;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

/** Generate a unique budget directory name from a human-readable name. */
export function idFromBudgetName(name: string): string {
  const sanitized = name
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 50);
  const suffix = randomUUID().slice(0, 7);
  return sanitized ? `${sanitized}-${suffix}` : suffix;
}
