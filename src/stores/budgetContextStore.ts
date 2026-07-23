import { create } from "zustand";
import { persist } from "zustand/middleware";
import { closeDatabase, openDatabase, isDatabaseOpen } from "@/core/db";
import {
  loadClock,
  saveClock,
  resetSyncState,
  clearSwitchingFlag,
  fullSync,
  waitForSyncToSettle,
} from "@/core/sync";
import { getBudgetDir, readMetadata, updateMetadata, deleteBudgetDir } from "@/core/server/prefs";
import { downloadBudget, possiblyUpload } from "@/core/server/cloud-storage";
import type { ReconciledBudgetFile } from "@/core/server/budgetfiles/app";
import type { RemoteBudgetFile } from "@/core/server/cloud-storage";
import * as encryption from "@/core/encryption";
import { loadKeyForBudget } from "@/core/encryption/keys";
import { ActualError } from "@/core/errors";
import { emitErrorEvent, toErrorCode } from "@/lib/errors/ErrorChannel";
import { useSessionStore } from "@/stores/sessionStore";
import { mmkvStorage } from "./prefsStorage";

// ---------------------------------------------------------------------------
// Budget context store — which budget file is open and its sync coordinates.
// ---------------------------------------------------------------------------
// This is the mobile budgetfilesSlice: the data/sync-layer state PLUS its
// operations (loadBudget / closeBudget / closeAndLoadBudget /
// closeAndDownloadBudget / deleteBudget) as store actions (idiomatic Zustand).
// State is read mostly imperatively by the sync engine and DB, and reactively
// where the UI reacts to a budget switch (useQuery recreating its liveQuery on
// activeBudgetId change).

type BudgetData = {
  activeBudgetId: string;
  budgetName?: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  isLocalOnly: boolean;
  /** True while loadBudget is doing its blocking setup — drives the global
   *  open-budget loader so it survives the file-picker screen unmounting. Transient
   *  (not persisted). */
  isOpening: boolean;
};

type BudgetContextState = BudgetData & {
  setBudgetContext(ctx: Partial<BudgetData>): void;
  reset(): void;
  /** Open an existing local budget (upstream budgetfilesSlice `loadBudget`). */
  loadBudget(budgetId: string, opts?: { force?: boolean }): Promise<void>;
  /** Close the currently open budget without opening another. */
  closeBudget(): Promise<void>;
  /** Close current, then load a local budget (upstream `closeAndLoadBudget`). */
  closeAndLoadBudget(localId: string): Promise<void>;
  /** Close current, download a remote file, then load it (upstream `closeAndDownloadBudget`). */
  closeAndDownloadBudget(
    file: ReconciledBudgetFile,
    serverUrl: string,
    token: string,
  ): Promise<void>;
  /** Delete a budget's local files, closing it first if active. */
  deleteBudget(budgetId: string): Promise<void>;
};

const INITIAL: BudgetData = {
  activeBudgetId: "",
  budgetName: undefined,
  fileId: "",
  groupId: "",
  encryptKeyId: undefined,
  lastSyncedTimestamp: undefined,
  isLocalOnly: false,
  isOpening: false,
};

export const useBudgetContextStore = create<BudgetContextState>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setBudgetContext(ctx) {
        set(ctx);
      },

      reset() {
        set({ ...INITIAL });
      },

      async loadBudget(budgetId, opts) {
        const t0 = Date.now();
        const lap = (label: string) => {
          if (__DEV__) console.log(`[loadBudget] ${label}: ${Date.now() - t0}ms`);
        };

        if (
          !opts?.force &&
          isDatabaseOpen(getBudgetDir(budgetId)) &&
          get().activeBudgetId === budgetId
        ) {
          if (__DEV__) console.log("[loadBudget] already open, skipping", budgetId);
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
          // Warm the payee/category mapping cache before rules, pre-fetch, or the
          // background fullSync can read rules — so migrateIds projects merged ids.
          // Mirrors loot-core loading mappings before the rules sync listeners.
          const { loadMappings } = await import("@/core/db/mappings");
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
          const { initSpreadsheet } = await import("@/core/server/sheet");
          await initSpreadsheet();
          lap("initSpreadsheet");

          // 7. Set sync-related budget context (needed for fullSync)
          get().setBudgetContext({
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
          get().setBudgetContext({
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
            possiblyUpload(serverUrl, token, budgetId).catch(async (e) => {
              emitErrorEvent(e, { operation: "possiblyUpload" });
              const code = toErrorCode(e);
              if (code.startsWith("sync/file-")) {
                // The 7-day re-upload hit a file-state rejection — same recovery
                // flow as a rejected /sync/sync, not a silent warn.
                const { useSyncStore } = await import("@/stores/syncStore");
                await useSyncStore.getState().handleSyncFileError(code);
              }
            });
          }
        } catch (error) {
          // Cleanup on failure (upstream pattern: closeBudget on error)
          await get()
            .closeBudget()
            .catch(() => {});
          throw error;
        }
      },

      async closeBudget() {
        await waitForSyncToSettle();
        resetSyncState();
        // Dynamic import avoids a resetStores <-> budgetContextStore init cycle.
        const { resetAllStores } = await import("@/stores/resetStores");
        resetAllStores();
        await closeDatabase();
        get().setBudgetContext({
          activeBudgetId: "",
          fileId: "",
          groupId: "",
          encryptKeyId: undefined,
          lastSyncedTimestamp: undefined,
          budgetName: undefined,
        });
      },

      async closeAndLoadBudget(localId) {
        set({ isOpening: true });
        try {
          // loadBudget already closes the previous budget first.
          await get().loadBudget(localId);
          set({ isOpening: false });
        } catch (e) {
          set({ isOpening: false });
          throw e;
        }
      },

      async closeAndDownloadBudget(file, serverUrl, token) {
        if (!file.cloudFileId) {
          throw new ActualError("file/switch-failed", {
            context: { reason: "no cloud file id" },
          });
        }
        const budgetFile: RemoteBudgetFile = {
          fileId: file.cloudFileId,
          groupId: file.groupId ?? "",
          name: file.name,
          encryptKeyId: file.encryptKeyId,
        };
        set({ isOpening: true });
        try {
          const localId = await downloadBudget(serverUrl, token, budgetFile);
          await get().loadBudget(localId);
          set({ isOpening: false });
        } catch (e) {
          set({ isOpening: false });
          throw e;
        }
      },

      async deleteBudget(budgetId) {
        if (get().activeBudgetId === budgetId) {
          await get().closeBudget();
        }
        await deleteBudgetDir(budgetId);
      },
    }),
    {
      name: "budget-context",
      storage: mmkvStorage,
      partialize: (state) => ({
        activeBudgetId: state.activeBudgetId,
        budgetName: state.budgetName,
        fileId: state.fileId,
        groupId: state.groupId,
        encryptKeyId: state.encryptKeyId,
        lastSyncedTimestamp: state.lastSyncedTimestamp,
        isLocalOnly: state.isLocalOnly,
      }),
    },
  ),
);
