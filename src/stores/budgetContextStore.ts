import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mmkvStorage } from "./prefsStorage";

// ---------------------------------------------------------------------------
// Budget context store — which budget file is open and its sync coordinates.
// ---------------------------------------------------------------------------
// This is state of the data/sync layer. Read mostly imperatively by the sync
// engine and DB, and reactively where the UI needs to react to a budget switch
// (e.g. useQuery recreating its liveQuery on activeBudgetId change).

type BudgetContextState = {
  activeBudgetId: string;
  budgetName?: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  isLocalOnly: boolean;

  setBudgetContext(ctx: Partial<Omit<BudgetContextState, "setBudgetContext" | "reset">>): void;
  reset(): void;
};

const INITIAL = {
  activeBudgetId: "",
  budgetName: undefined,
  fileId: "",
  groupId: "",
  encryptKeyId: undefined,
  lastSyncedTimestamp: undefined,
  isLocalOnly: false,
} satisfies Omit<BudgetContextState, "setBudgetContext" | "reset">;

export const useBudgetContextStore = create<BudgetContextState>()(
  persist(
    (set) => ({
      ...INITIAL,

      setBudgetContext(ctx) {
        set(ctx);
      },

      reset() {
        set({ ...INITIAL });
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
