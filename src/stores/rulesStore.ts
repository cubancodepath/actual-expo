import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import { getRules } from '../rules';
import type { ParsedRule } from '../rules/types';

type RulesState = {
  rules: ParsedRule[];
  loading: boolean;
  load(): Promise<void>;
};

export const useRulesStore = create<RulesState>((set) => ({
  rules: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const rules = await getRules();
      set({ rules });
    } finally {
      set({ loading: false });
    }
  },
}));

registerStore('rules', ['rules'], () => useRulesStore.getState().load());
