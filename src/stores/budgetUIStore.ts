/**
 * Budget UI state — month selection + transient modal state.
 *
 * This is the minimal Zustand store that remains after migrating budget
 * data to the spreadsheet engine. Only holds shared UI state:
 * - `month`: which month is being viewed
 * - `coverTarget`: transient state for cover-overspent modal flow
 */

import { create } from "zustand";
import { currentMonth } from "../lib/date";

type CoverTarget = { catId: string; catName: string; balance: number };

type BudgetUIState = {
  month: string;
  coverTarget: CoverTarget | null;
  setMonth(month: string): void;
  setCoverTarget(target: CoverTarget | null): void;
};

export const useBudgetUIStore = create<BudgetUIState>((set) => ({
  month: currentMonth(),
  coverTarget: null,

  setMonth(month) {
    set({ month });
  },

  setCoverTarget(target) {
    set({ coverTarget: target });
  },
}));
