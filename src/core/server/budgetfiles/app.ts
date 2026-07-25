// Budget-file handlers — the mobile analogue of upstream's
// `loot-core/src/server/budgetfiles/app.ts`. The store-free handlers live here
// (createBudget, reconcileFiles, convertToLocalOnly, reRegisterBudget); the
// store-orchestrating flows (loadBudget/closeBudget/switchBudget/deleteBudget)
// stay in the app layer, mirroring upstream's desktop-client budgetfilesSlice.
import { openDatabase } from "@/core/db";
import { loadClock } from "@/core/sync";
import {
  type BudgetMetadata,
  ensureBudgetsDir,
  getBudgetDir,
  writeMetadata,
  updateMetadata,
  idFromBudgetName,
} from "@/core/server/prefs";
import { uploadBudget, type RemoteBudgetFile } from "@/core/server/cloud-storage";
import {
  seedLocalBudget,
  getDefaultCategorySelection,
  type CategorySelection,
} from "@/core/server/budgetfiles/seed";

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
 * Seeds the default category groups + dashboard but NO account (upstream also
 * creates the plan without an account — accounts are added afterwards).
 * Leaves the raw DB connection open (callers do a proper loadBudget() once
 * setup finishes). Returns the new budgetId.
 */
export async function createBudget(opts: {
  budgetName: string;
  selectedCategories?: CategorySelection;
}): Promise<string> {
  const budgetId = idFromBudgetName(opts.budgetName);
  if (__DEV__) console.log("[budgetfiles] Creating budget:", budgetId);

  await ensureBudgetsDir();
  await writeMetadata(budgetId, { id: budgetId, budgetName: opts.budgetName });
  await openDatabase(getBudgetDir(budgetId));
  await loadClock();

  await seedLocalBudget({
    selectedCategories: opts.selectedCategories ?? getDefaultCategorySelection(),
  });

  return budgetId;
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
