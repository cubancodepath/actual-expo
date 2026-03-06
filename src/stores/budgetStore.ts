import { create } from 'zustand';
import { getBudgetMonth, setBudgetAmount, holdForNextMonth, resetHold, setCategoryCarryover, transferBetweenCategories } from '../budgets';
import { currentMonth } from '../lib/date';
import { computeGoalAllocations } from '../goals/apply';
import type { ComputeGoalsResult } from '../goals/apply';
import type { BudgetMonth } from '../budgets/types';

type CoverTarget = { catId: string; catName: string; balance: number };

type BudgetState = {
  month: string;
  data: BudgetMonth | null;
  loading: boolean;
  /** Transient state: category selected in the cover-overspent form sheet. */
  coverTarget: CoverTarget | null;
  setMonth(month: string): void;
  load(): Promise<void>;
  setAmount(categoryId: string, amount: number): Promise<void>;
  /** Hold `amount` cents for the next month. */
  hold(amount: number): Promise<void>;
  /** Clear the hold for the current month. */
  resetHold(): Promise<void>;
  /** Toggle rollover overspending for a category (current month + future rows). */
  setCarryover(categoryId: string, flag: boolean): Promise<void>;
  /** Move `amountCents` from one category budget to another for the current month. */
  transfer(fromCategoryId: string, toCategoryId: string, amountCents: number): Promise<void>;
  /** Compute goal allocations for all categories (dry run, no DB writes). */
  computeGoals(force?: boolean): Promise<ComputeGoalsResult>;
  setCoverTarget(target: CoverTarget | null): void;
};

export const useBudgetStore = create<BudgetState>((set, get) => ({
  month: currentMonth(),
  data: null,
  loading: false,
  coverTarget: null,

  setMonth(month) {
    set({ month });
    get().load();
  },

  async load() {
    set({ loading: true });
    try {
      const data = await getBudgetMonth(get().month);
      set({ data });
    } finally {
      set({ loading: false });
    }
  },

  async setAmount(categoryId, amount) {
    await setBudgetAmount(get().month, categoryId, amount);
    // load() will be called by applyMessages → refreshAllStores
  },

  async hold(amount) {
    const { month, data } = get();
    const currentToBudget = data?.toBudget ?? 0;
    await holdForNextMonth(month, amount, currentToBudget);
    await get().load();
  },

  async resetHold() {
    await resetHold(get().month);
    await get().load();
  },

  async setCarryover(categoryId, flag) {
    await setCategoryCarryover(get().month, categoryId, flag);
  },

  async transfer(fromCategoryId, toCategoryId, amountCents) {
    await transferBetweenCategories(get().month, fromCategoryId, toCategoryId, amountCents);
    await get().load();
  },

  async computeGoals(force = false) {
    return computeGoalAllocations(get().month, force);
  },

  setCoverTarget(target) {
    set({ coverTarget: target });
  },
}));
