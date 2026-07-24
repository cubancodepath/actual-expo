import { create } from "zustand";
import { persist } from "zustand/middleware";
import { mmkvStorage } from "./prefsStorage";

// ---------------------------------------------------------------------------
// Budget context store — which budget file is open and its sync coordinates.
// ---------------------------------------------------------------------------
// The mobile budgetfilesSlice STATE. Pure slice: state + setBudgetContext +
// reset, and nothing else — it imports no sibling store. The multi-store
// workflows (loadBudget / closeBudget / closeAndLoadBudget /
// closeAndDownloadBudget / deleteBudget) live in
// src/stores/operations/budgetfiles.ts (operations → stores → core), which is
// what keeps the stores free of module-init cycles.
//
// State is read mostly imperatively by the operations layer, and reactively
// where the UI reacts to a budget switch (useQuery recreating its liveQuery on
// activeBudgetId change).

export type BudgetData = {
  activeBudgetId: string;
  budgetName?: string;
  fileId: string;
  groupId: string;
  encryptKeyId?: string;
  lastSyncedTimestamp?: string;
  isLocalOnly: boolean;
};

type BudgetContextState = BudgetData & {
  setBudgetContext(ctx: Partial<BudgetData>): void;
  reset(): void;
};

const INITIAL: BudgetData = {
  activeBudgetId: "",
  budgetName: undefined,
  fileId: "",
  groupId: "",
  encryptKeyId: undefined,
  lastSyncedTimestamp: undefined,
  isLocalOnly: false,
};

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
