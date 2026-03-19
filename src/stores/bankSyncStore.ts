// ---------------------------------------------------------------------------
// Bank Sync Store — tracks provider availability and per-account sync status
// ---------------------------------------------------------------------------

import { create } from "zustand";
import { getGoCardlessStatus, getSimpleFinStatus } from "../bank-sync/service";
import { syncAccount as doSyncAccount, BankSyncError } from "../bank-sync";
import { runQuery } from "../db";
// Accounts are now reactive via useLiveQuery — no manual refresh needed

type AccountSyncStatus = "idle" | "syncing" | "success" | "error";

type BankSyncState = {
  // Provider availability (from server /status endpoints)
  goCardlessConfigured: boolean;
  simpleFinConfigured: boolean;
  providersChecked: boolean;

  // Per-account sync status
  syncStatus: Record<string, AccountSyncStatus>;
  syncErrors: Record<string, string | null>;
  syncResults: Record<string, { added: number; updated: number } | null>;

  // Actions
  checkProviders(): Promise<void>;
  syncAccount(accountId: string): Promise<void>;
  syncAllLinkedAccounts(): Promise<void>;
  clearStatus(accountId: string): void;
};

export const useBankSyncStore = create<BankSyncState>((set, get) => ({
  goCardlessConfigured: false,
  simpleFinConfigured: false,
  providersChecked: false,

  syncStatus: {},
  syncErrors: {},
  syncResults: {},

  async checkProviders() {
    try {
      const [gc, sf] = await Promise.allSettled([getGoCardlessStatus(), getSimpleFinStatus()]);

      set({
        goCardlessConfigured: gc.status === "fulfilled" && gc.value.configured,
        simpleFinConfigured: sf.status === "fulfilled" && sf.value.configured,
        providersChecked: true,
      });
    } catch {
      // If both fail, mark as checked but not configured
      set({ providersChecked: true });
    }
  },

  async syncAccount(accountId) {
    const { syncStatus } = get();
    if (syncStatus[accountId] === "syncing") return;

    set({
      syncStatus: { ...get().syncStatus, [accountId]: "syncing" },
      syncErrors: { ...get().syncErrors, [accountId]: null },
      syncResults: { ...get().syncResults, [accountId]: null },
    });

    try {
      const result = await doSyncAccount(accountId);

      set({
        syncStatus: { ...get().syncStatus, [accountId]: "success" },
        syncResults: {
          ...get().syncResults,
          [accountId]: { added: result.added.length, updated: result.updated.length },
        },
      });

      // Accounts refresh automatically via liveQuery
    } catch (e: unknown) {
      const message =
        e instanceof BankSyncError
          ? `${e.errorType}: ${e.errorCode}`
          : e instanceof Error
            ? e.message
            : "Unknown error";

      set({
        syncStatus: { ...get().syncStatus, [accountId]: "error" },
        syncErrors: { ...get().syncErrors, [accountId]: message },
      });
    }
  },

  async syncAllLinkedAccounts() {
    // Find all accounts with a sync source
    const linked = await runQuery<{ id: string }>(
      `SELECT id FROM accounts WHERE account_sync_source IS NOT NULL AND tombstone = 0`,
    );

    // Sync sequentially to avoid rate limits
    for (const { id } of linked) {
      await get().syncAccount(id);
    }
  },

  clearStatus(accountId) {
    set({
      syncStatus: { ...get().syncStatus, [accountId]: "idle" },
      syncErrors: { ...get().syncErrors, [accountId]: null },
      syncResults: { ...get().syncResults, [accountId]: null },
    });
  },
}));
