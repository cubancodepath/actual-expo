import {
  documentDirectory,
  readDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
} from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';

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
};

// ---------------------------------------------------------------------------
// Directory management
// ---------------------------------------------------------------------------

export async function ensureBudgetsDir(): Promise<void> {
  const info = await getInfoAsync(BUDGETS_DIR);
  if (!info.exists) {
    await makeDirectoryAsync(BUDGETS_DIR, { intermediates: true });
  }
}

export async function budgetExists(budgetId: string): Promise<boolean> {
  const info = await getInfoAsync(getMetadataPath(budgetId));
  return info.exists;
}

export async function deleteBudgetDir(budgetId: string): Promise<void> {
  await deleteAsync(getBudgetDir(budgetId), { idempotent: true });
}

// ---------------------------------------------------------------------------
// Metadata CRUD
// ---------------------------------------------------------------------------

export async function readMetadata(budgetId: string): Promise<BudgetMetadata | null> {
  const path = getMetadataPath(budgetId);
  const info = await getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await readAsStringAsync(path);
  return JSON.parse(raw) as BudgetMetadata;
}

export async function writeMetadata(budgetId: string, meta: BudgetMetadata): Promise<void> {
  const dir = getBudgetDir(budgetId);
  await makeDirectoryAsync(dir, { intermediates: true });
  await writeAsStringAsync(getMetadataPath(budgetId), JSON.stringify(meta, null, 2));
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

export async function listLocalBudgets(): Promise<BudgetMetadata[]> {
  const info = await getInfoAsync(BUDGETS_DIR);
  if (!info.exists) return [];

  const entries = await readDirectoryAsync(BUDGETS_DIR);
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
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 50);
  const suffix = randomUUID().slice(0, 7);
  return sanitized ? `${sanitized}-${suffix}` : suffix;
}
