/**
 * Budget UI state — month selection + transient modal state.
 *
 * This is the minimal Zustand store that remains after migrating budget
 * data to the spreadsheet engine. Only holds shared UI state:
 * - `month`: which month is being viewed
 * - `pickedCategory`: the category a picker sheet handed back to its opener
 */

import { create } from "zustand";
import { currentMonth } from "@/core/shared/months";

/**
 * A category chosen in a picker sheet. The picker writes it and pops itself; the
 * screen underneath reads it and clears it. A store rather than route params
 * because the selection travels *back* down the stack.
 */
type PickedCategory = { catId: string; catName: string; balance: number };

type BudgetUIState = {
  month: string;
  pickedCategory: PickedCategory | null;
  setMonth(month: string): void;
  setPickedCategory(picked: PickedCategory | null): void;
};

export const useBudgetUIStore = create<BudgetUIState>((set) => ({
  month: currentMonth(),
  pickedCategory: null,

  setMonth(month) {
    set({ month });
  },

  setPickedCategory(picked) {
    set({ pickedCategory: picked });
  },
}));
