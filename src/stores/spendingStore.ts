import { create } from 'zustand';

interface SpendingState {
  hideReconciled: boolean;
  toggleHideReconciled: () => void;
}

export const useSpendingStore = create<SpendingState>((set) => ({
  hideReconciled: false,
  toggleHideReconciled: () => set((s) => ({ hideReconciled: !s.hideReconciled })),
}));
