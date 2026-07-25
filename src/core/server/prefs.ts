// Local budget metadata (metadata.json) — the mobile analogue of upstream's
// `loot-core/src/server/prefs`. Pure core: reaches the filesystem only through
// `@/core/platform/fs` and randomness through `@/core/platform/crypto`, and it
// only THROWS typed ActualErrors (the error bus is app-level — the react-query
// caches and UI callers surface these).
import { fs } from "@/core/platform/fs";
import { randomUUID } from "@/core/platform/crypto";
import { ActualError, type ErrorCode } from "@/core/errors";

// ---------------------------------------------------------------------------
// Constants & path helpers
// ---------------------------------------------------------------------------

export const BUDGETS_DIR = `${fs.documentDirectory}budgets/`;

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
    if (!(await fs.exists(BUDGETS_DIR))) {
      await fs.mkdir(BUDGETS_DIR, { intermediates: true });
    }
  } catch (error) {
    throw storageError(error, "storage/write-failed", "ensureBudgetsDir", { path: BUDGETS_DIR });
  }
}

export async function budgetExists(budgetId: string): Promise<boolean> {
  const path = getMetadataPath(budgetId);
  try {
    return await fs.exists(path);
  } catch (error) {
    throw storageError(error, "storage/read-failed", "budgetExists", { budgetId, path });
  }
}

export async function deleteBudgetDir(budgetId: string): Promise<void> {
  const path = getBudgetDir(budgetId);
  try {
    await fs.removeFile(path, { idempotent: true });
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
    if (!(await fs.exists(path))) return null;
    raw = await fs.readFile(path);
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
    await fs.mkdir(dir, { intermediates: true });
    await fs.writeFile(path, JSON.stringify(meta, null, 2));
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
    if (!(await fs.exists(BUDGETS_DIR))) return [];
    entries = await fs.listDir(BUDGETS_DIR);
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
// In-memory prefs (upstream loot-core/src/server/prefs.ts: loadPrefs /
// getPrefs / savePrefs / unloadPrefs)
// ---------------------------------------------------------------------------
// The budget-scoped prefs snapshot the sync core reads (cloudFileId, groupId,
// lastSyncedTimestamp, encryptKeyId) — the reason core/sync never needs to
// import app stores. Loaded by loadBudget, cleared on close/switch. Backed by
// the same metadata.json the CRUD above manages.

export type MetadataPrefs = BudgetMetadata;

let prefs: MetadataPrefs | null = null;

export async function loadPrefs(id: string): Promise<MetadataPrefs> {
  const meta = await readMetadata(id).catch(() => null);
  // Upstream is lenient here: a corrupt/missing metadata file must not block
  // opening the budget database — default the budget name to the id.
  prefs = meta ?? { id, budgetName: id };
  // No matter what is in the `id` field, force it to be the current id —
  // resilient to users moving folders around (upstream comment).
  prefs.id = id;
  return prefs;
}

export async function savePrefs(
  prefsToSet: Partial<MetadataPrefs>,
  { avoidSync = false } = {},
): Promise<void> {
  if (!prefs) return;
  Object.assign(prefs, prefsToSet);

  if (!avoidSync && typeof prefsToSet.budgetName === "string") {
    // Upstream whitelist: budgetName is the one pref that syncs to peers as a
    // 'prefs' CRDT message. Dynamic imports break the prefs↔sync module cycle.
    const [{ sendMessages }, { Timestamp }] = await Promise.all([
      import("@/core/server/sync"),
      import("@/core/crdt"),
    ]);
    await sendMessages([
      {
        dataset: "prefs",
        row: "budgetName",
        column: "value",
        value: prefsToSet.budgetName,
        timestamp: Timestamp.send()!,
      },
    ]);
  }

  await writeMetadata(prefs.id, prefs);
}

export function unloadPrefs(): void {
  prefs = null;
}

export function getPrefs(): MetadataPrefs | null {
  return prefs;
}

export function getDefaultPrefs(id: string, budgetName: string): MetadataPrefs {
  return { id, budgetName };
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
