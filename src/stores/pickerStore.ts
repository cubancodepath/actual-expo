import { create } from 'zustand';
import type { RecurConfig } from '../schedules/types';

type PayeeSelection = { id: string | null; name: string; transferAcct?: string | null };
type CategorySelection = { id: string | null; name: string };
type AccountSelection = { id: string; name: string };

export type SplitLine = {
  id: string;
  categoryId: string | null;
  categoryName: string;
  amount: number; // cents, always positive
};

type SplitCategorySelection = {
  lineId: string;
  categoryId: string | null;
  categoryName: string;
};

interface PickerState {
  selectedPayee: PayeeSelection | null;
  selectedCategory: CategorySelection | null;
  selectedAccount: AccountSelection | null;
  selectedTags: string[] | null;
  selectedRecurConfig: RecurConfig | null;
  splitCategories: SplitLine[] | null;
  splitCategorySelection: SplitCategorySelection | null;
  setPayee: (p: PayeeSelection) => void;
  setCategory: (c: CategorySelection) => void;
  setAccount: (a: AccountSelection) => void;
  setTags: (tags: string[]) => void;
  setRecurConfig: (c: RecurConfig | null) => void;
  setSplitCategories: (lines: SplitLine[] | null) => void;
  setSplitCategorySelection: (s: SplitCategorySelection | null) => void;
  clear: () => void;
}

export const usePickerStore = create<PickerState>((set) => ({
  selectedPayee: null,
  selectedCategory: null,
  selectedAccount: null,
  selectedTags: null,
  selectedRecurConfig: null,
  splitCategories: null,
  splitCategorySelection: null,
  setPayee: (p) => set({ selectedPayee: p }),
  setCategory: (c) => set({ selectedCategory: c }),
  setAccount: (a) => set({ selectedAccount: a }),
  setTags: (tags) => set({ selectedTags: tags }),
  setRecurConfig: (c) => set({ selectedRecurConfig: c }),
  setSplitCategories: (lines) => set({ splitCategories: lines }),
  setSplitCategorySelection: (s) => set({ splitCategorySelection: s }),
  clear: () => set({
    selectedPayee: null,
    selectedCategory: null,
    selectedAccount: null,
    selectedTags: null,
    selectedRecurConfig: null,
    splitCategories: null,
    splitCategorySelection: null,
  }),
}));
