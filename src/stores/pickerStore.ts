import { create } from 'zustand';

type PayeeSelection = { id: string | null; name: string };
type CategorySelection = { id: string | null; name: string };
type AccountSelection = { id: string; name: string };

interface PickerState {
  selectedPayee: PayeeSelection | null;
  selectedCategory: CategorySelection | null;
  selectedAccount: AccountSelection | null;
  setPayee: (p: PayeeSelection) => void;
  setCategory: (c: CategorySelection) => void;
  setAccount: (a: AccountSelection) => void;
  clear: () => void;
}

export const usePickerStore = create<PickerState>((set) => ({
  selectedPayee: null,
  selectedCategory: null,
  selectedAccount: null,
  setPayee: (p) => set({ selectedPayee: p }),
  setCategory: (c) => set({ selectedCategory: c }),
  setAccount: (a) => set({ selectedAccount: a }),
  clear: () => set({ selectedPayee: null, selectedCategory: null, selectedAccount: null }),
}));
