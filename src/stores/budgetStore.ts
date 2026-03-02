import { create } from 'zustand';
import { getBudgetMonth, setBudgetAmount, holdForNextMonth, resetHold, setCategoryCarryover, transferBetweenCategories } from '../budgets';
import type { BudgetMonth } from '../budgets/types';

function currentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

type BudgetState = {
  month: string;
  data: BudgetMonth | null;
  loading: boolean;
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
};

export const useBudgetStore = create<BudgetState>((set, get) => ({
  month: currentMonth(),
  data: null,
  loading: false,

  setMonth(month) {
    set({ month });
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
    // refreshAllStores will reload via applyMessages
  },

  async resetHold() {
    await resetHold(get().month);
  },

  async setCarryover(categoryId, flag) {
    await setCategoryCarryover(get().month, categoryId, flag);
  },

  async transfer(fromCategoryId, toCategoryId, amountCents) {
    await transferBetweenCategories(get().month, fromCategoryId, toCategoryId, amountCents);
    await get().load();
  },
}));
