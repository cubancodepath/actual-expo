// Budget-file operations — the mobile budgetfilesSlice thunks (upstream
// loot-core budgetfiles/app.ts + desktop-client budgetfilesSlice). These
// orchestrate the DB, sync engine, prefs, query cache, spreadsheet and every
// store during a budget open/close, so they live in the operations layer
// (one-way: operations → stores → core), keeping budgetContextStore itself a
// pure state slice free of sibling-store imports and module-init cycles.
import { closeDatabase, openDatabase, isDatabaseOpen } from "@/core/server/db";
import {
  loadClock,
  saveClock,
  resetSyncState,
  clearSwitchingFlag,
  fullSync,
  waitForSyncToSettle,
  setSyncingMode,
} from "@/core/server/sync";
import {
  getBudgetDir,
  readMetadata,
  updateMetadata,
  deleteBudgetDir,
  loadPrefs,
  unloadPrefs,
} from "@/core/server/prefs";
import { downloadBudget, possiblyUpload, uploadBudget } from "@/core/server/cloud-storage";
import type { RemoteBudgetFile } from "@/core/server/cloud-storage";
import { emit, setSyncEventsMuted } from "@/core/server/sync/syncEvents";
import { createBudget } from "@/core/server/budgetfiles/app";
import { unloadRules } from "@/core/server/transactions/transaction-rules";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import * as encryption from "@/core/server/encryption";
import { loadKeyForBudget } from "@/core/server/encryption/keys";
import { ActualError } from "@/core/errors";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useSyncStore } from "@/stores/syncStore";
import { resetAllStores } from "@/stores/operations/resetStores";
import { clearAutoRecoveryGuard } from "@/stores/operations/autoRecoveryGuard";
import { useSyncedPrefsStore } from "@/hooks/useSyncedPrefs";
// busyStore directly (not the barrel) so this module never pulls the host
// component (react-native/heroui) into Node test imports.
import { busy } from "@/ui/feedback/busy/busyStore";

/** Max time the busy overlay waits for the first post-download sync. */
const FIRST_SYNC_OVERLAY_TIMEOUT_MS = 30_000;

/**
 * Settle sync and close the current budget's DB safely — the shared "step 1"
 * of every budget switch. Does NOT resetAllStores() (see the note in
 * loadBudget). After this, the db handle is null so any late liveQuery
 * refetch no-ops via runQuery's guard instead of racing the native close.
 */
async function settleAndCloseCurrentBudget(): Promise<void> {
  await waitForSyncToSettle();
  // Also clears the undo history — it holds this budget's CRDT messages.
  resetSyncState();
  unloadPrefs();
  // The in-memory rule store mirrors the DB we're about to close; leaving it
  // loaded would run the old file's rules against the next one (upstream
  // reloads rules per budget open).
  unloadRules();
  // Sync UI state (conflict dialog, error badge, lastSync) is scoped to a
  // budget — never carry it into the next one. The recovery guard is
  // per-budget too (cross-budget contamination fix).
  useSyncStore.getState().resetForBudgetSwitch();
  clearAutoRecoveryGuard();
  await closeDatabase();
}

/** Open an existing local budget (upstream budgetfilesSlice `loadBudget`). */
export async function loadBudget(budgetId: string, opts?: { force?: boolean }): Promise<void> {
  const ctx = () => useBudgetContextStore.getState();

  const t0 = Date.now();
  const lap = (label: string) => {
    if (__DEV__) console.log(`[loadBudget] ${label}: ${Date.now() - t0}ms`);
  };

  if (!opts?.force && isDatabaseOpen(getBudgetDir(budgetId)) && ctx().activeBudgetId === budgetId) {
    if (__DEV__) console.log("[loadBudget] already open, skipping", budgetId);
    return;
  }

  try {
    // 1. Close previous budget — settle sync + close DB, but do NOT resetAllStores()
    // here. Resetting stores triggers immediate re-renders with empty/0 values on
    // components with EaseView (BudgetGroupHeader, etc.), causing a native SIGSEGV
    // when Fabric tries to update props on deallocating views. Instead, we let
    // the data transition happen atomically when activeBudgetId changes.
    await settleAndCloseCurrentBudget();
    lap("close + reset");

    // 2. Open DB + load clock
    const budgetDir = getBudgetDir(budgetId);
    await openDatabase(budgetDir);
    let meta = await readMetadata(budgetId);
    const isFirstOpen = !!meta?.resetClock;
    await loadClock();
    // Warm the payee/category mapping cache before rules, pre-fetch, or the
    // background fullSync can read rules — so migrateIds projects merged ids.
    // Mirrors loot-core loading mappings before the rules sync listeners.
    const { loadMappings } = await import("@/core/server/db/mappings");
    await loadMappings();
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
    await useSyncedPrefsStore.getState().load();

    // 5. Pre-fetch core queries into cache — gives instant first render with local data.
    // liveQuery takes over reactively after mount; sync updates flow through events.
    const { executeQuery } = await import("@/core/server/aql/execute");
    const { q } = await import("@/core/shared/query");
    const { setQueryCache, clearQueryCache } = await import("@/lib/queries/queryCache");
    clearQueryCache(); // Clear old budget's stale entries before populating with new data

    // Tags are not part of the AQL schema (queried via raw SQL in the
    // `tags` domain), so they're not pre-fetched here.
    const [accounts, categories, groups, payees] = await Promise.all([
      executeQuery(q("accounts")),
      executeQuery(q("categories")),
      executeQuery(q("category_groups")),
      executeQuery(q("payees")),
    ]);
    setQueryCache(q("accounts").serializeAsString(), accounts.data);
    setQueryCache(q("categories").serializeAsString(), categories.data);
    setQueryCache(q("category_groups").serializeAsString(), groups.data);
    setQueryCache(q("payees").serializeAsString(), payees.data);

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
      const bq = q("transactions").filter({ account: a.id }).calculate({ $sum: "$amount" });
      return executeQuery(bq).then((r) => setQueryCache(bq.serializeAsString(), r.data));
    });

    // Group totals (same query shape as useAccountGroupBalance)
    if (budgetIds.length > 0) {
      const gq = q("transactions")
        .filter({ account: { $oneof: budgetIds } })
        .calculate({ $sum: "$amount" });
      balanceQueries.push(
        executeQuery(gq).then((r) => setQueryCache(gq.serializeAsString(), r.data)),
      );
    }
    if (offBudgetIds.length > 0) {
      const gq = q("transactions")
        .filter({ account: { $oneof: offBudgetIds } })
        .calculate({ $sum: "$amount" });
      balanceQueries.push(
        executeQuery(gq).then((r) => setQueryCache(gq.serializeAsString(), r.data)),
      );
    }

    if (balanceQueries.length > 0) await Promise.all(balanceQueries);
    lap("pre-fetch queries");

    // 6. Initialize spreadsheet engine with local data. Phase message on the
    // busy overlay (no-op when loadBudget runs outside busy.run, e.g. the
    // splash-covered bootstrap reopen). loadSpreadsheet still takes an
    // onProgress callback, but the overlay deliberately shows no counter.
    const { loadSpreadsheet } = await import("@/core/server/sheet");
    const { default: i18n } = await import("@/i18n/config");
    busy.setMessage(i18n.t("common:calculatingBudget"));
    await loadSpreadsheet();
    lap("loadSpreadsheet");

    // 7. Set sync-related budget context (needed for fullSync)
    ctx().setBudgetContext({
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

    // 9b. Load the core-owned prefs snapshot the sync engine reads
    // (upstream loadPrefs) — AFTER all the metadata writes above so it
    // can't go stale — and set the syncing mode for this budget:
    // upstream main.ts runs budgets without a cloud sync target in
    // "offline" mode (scheduled syncs skip, the CRDT log still records).
    await loadPrefs(budgetId);
    setSyncingMode(meta?.cloudFileId && meta?.groupId ? "enabled" : "offline");

    // 10. Activate UI — render with local data (upstream pattern: show before sync)
    ctx().setBudgetContext({
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
        if (__DEV__) console.warn("[loadBudget] background sync failed:", e);
      });

      // Periodic full-snapshot re-upload (non-blocking) — matches upstream
      // budgetfiles/app.ts:633, called on budget load. Without this the
      // server-side message history grows unbounded forever. Core stays
      // store-free, so pass the session credentials in.
      const { serverUrl, token } = useSessionStore.getState();
      possiblyUpload(serverUrl, token, budgetId).catch((e) => {
        const code = toErrorCode(e);
        if (code.startsWith("sync/file-")) {
          // The 7-day re-upload hit a file-state rejection — same recovery
          // flow as a rejected /sync/sync, not a silent warn. Route it as a
          // sync error EVENT so the listenForSyncEvent policy owner reports it
          // AND runs handleSyncFileError, exactly like a rejected /sync/sync.
          // (Importing syncRecovery here would be a module cycle — it imports
          // this module's closeBudget/loadBudget.) The listener emits to the
          // error bus itself, so don't also emitErrorEvent here (no double
          // Sentry report).
          emit({ type: "error", subtype: code, meta: e });
        } else {
          emitErrorEvent(e, { operation: "possiblyUpload" });
        }
      });
    }
  } catch (error) {
    if (__DEV__) console.warn("[loadBudget] failed:", error);
    // Cleanup on failure (upstream pattern: closeBudget on error)
    await closeBudget().catch(() => {});
    throw error;
  }
}

/**
 * Create a new budget file and open it (the "New Budget" screen workflow).
 *
 * Sequencing matters — createBudget opens a raw connection on the GLOBAL db
 * handle to seed the new file, and the sync-event bus is global too. Without
 * the settle/mute discipline two native races appear (SIGSEGV on
 * expo.module.sqlite.AsyncQueue):
 *   1. createBudget's openDatabase would steal the ACTIVE budget's connection
 *      while its liveQueries/spreadsheet/sync still run statements on it.
 *   2. the seed's batched writes emit "applied" events, making the old
 *      screens' liveQueries re-query the temporary connection right as we
 *      close it before the proper loadBudget.
 * Upstream never hits this: its server runs behind an IPC layer with no
 * shared connection, and create-budget copies a bundled template db.
 *
 * On a server-mode upload failure the local file already exists — pass the
 * returned/previous id back as `existingBudgetId` to retry without
 * re-seeding (duplicate data otherwise).
 */
export async function createAndLoadBudget(opts: {
  budgetName: string;
  mode: "local" | "server";
  existingBudgetId?: string;
}): Promise<string> {
  // Blocking overlay for the whole thing — this ends in loadBudget, the same
  // heavy work closeAndLoadBudget already covers. No message: the overlay's
  // generic label is deliberate (LoadingOverlay: "same overlay everywhere").
  return busy.run(async () => {
    // 1. Settle + close whatever budget is open (kills race 1; the switching
    // flag also pauses the periodic sync until loadBudget clears it).
    await settleAndCloseCurrentBudget();

    // 2. Create + seed + upload with the event bus muted (kills race 2: nothing
    // re-queries the temporary connection, so the close below can't race).
    let budgetId = opts.existingBudgetId;
    setSyncEventsMuted(true);
    try {
      if (!budgetId) {
        budgetId = await createBudget({ budgetName: opts.budgetName });
      }
      if (opts.mode === "server") {
        // Writes cloudFileId/groupId into metadata — loadBudget picks them up
        // and enables syncing + the background fullSync on its own.
        const { serverUrl, token } = useSessionStore.getState();
        await uploadBudget(serverUrl, token, budgetId);
      }
      // Close the raw seed connection; safe now — no statements in flight.
      await closeDatabase();
    } finally {
      setSyncEventsMuted(false);
    }

    // 3. Proper open: prefs, pre-fetch, spreadsheet, context, background sync.
    await loadBudget(budgetId);

    // loadBudget doesn't own the local-only flag — it comes from how the
    // budget was created, not from metadata.
    useBudgetContextStore.getState().setBudgetContext({ isLocalOnly: opts.mode === "local" });

    return budgetId;
  });
}

/** Close the currently open budget without opening another. */
export async function closeBudget(): Promise<void> {
  await waitForSyncToSettle();
  resetSyncState();
  resetAllStores();
  unloadPrefs();
  unloadRules();
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

/** Close current, then load a local budget (upstream `closeAndLoadBudget`). */
export async function closeAndLoadBudget(localId: string): Promise<void> {
  const { default: i18n } = await import("@/i18n/config");
  // loadBudget already closes the previous budget first. The busy overlay
  // lives at the app root, so it survives the file picker unmounting.
  await busy.run(() => loadBudget(localId), { message: i18n.t("common:openingBudget") });
}

/** Close current, download a remote file, then load it (upstream `closeAndDownloadBudget`). */
export async function closeAndDownloadBudget(
  file: ReconciledBudgetFile,
  serverUrl: string,
  token: string,
): Promise<void> {
  if (!file.cloudFileId) {
    throw new ActualError("file/switch-failed", { context: { reason: "no cloud file id" } });
  }
  const budgetFile: RemoteBudgetFile = {
    fileId: file.cloudFileId,
    groupId: file.groupId ?? "",
    name: file.name,
    encryptKeyId: file.encryptKeyId,
  };
  const { default: i18n } = await import("@/i18n/config");
  await busy.run(
    async () => {
      const localId = await downloadBudget(serverUrl, token, budgetFile);
      busy.setMessage(i18n.t("common:openingBudget"));
      await loadBudget(localId);

      // First open after a download: the background sync applies the full
      // message history and recomputes cells right after — a jank spike if
      // the overlay is already gone. Hold it until that first sync settles.
      // fullSync() dedupes: this returns the promise loadBudget already
      // started. Timeboxed so a dead server can't trap the user behind the
      // overlay.
      busy.setMessage(i18n.t("common:syncingBudget"));
      await Promise.race([
        fullSync({ force: true }).catch(() => 0),
        new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_OVERLAY_TIMEOUT_MS)),
      ]);
    },
    { message: i18n.t("common:downloadingBudget") },
  );
}

/** Delete a budget's local files, closing it first if active. */
export async function deleteBudget(budgetId: string): Promise<void> {
  if (useBudgetContextStore.getState().activeBudgetId === budgetId) {
    await closeBudget();
  }
  await deleteBudgetDir(budgetId);
}
