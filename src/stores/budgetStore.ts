import { create } from 'zustand';
import { getBudgetMonth, setBudgetAmount } from '../budgets';
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
}));
