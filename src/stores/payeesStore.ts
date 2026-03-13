import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import { getPayees, createPayee, updatePayee, deletePayee, mergePayees } from '../payees';
import type { Payee } from '../payees/types';

type PayeesState = {
  payees: Payee[];
  loading: boolean;
  load(): Promise<void>;
  create(name: string): Promise<string>;
  update(id: string, fields: Partial<Pick<Payee, 'name' | 'favorite'>>): Promise<void>;
  delete_(id: string): Promise<void>;
  merge(targetId: string, ids: string[]): Promise<void>;
};

export const usePayeesStore = create<PayeesState>((set) => ({
  payees: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const payees = await getPayees();
      set({ payees });
    } finally {
      set({ loading: false });
    }
  },

  async create(name) {
    return createPayee({ name });
  },

  async update(id, fields) {
    return updatePayee(id, fields);
  },

  async delete_(id) {
    return deletePayee(id);
  },

  async merge(targetId, ids) {
    return mergePayees(targetId, ids);
  },
}));

registerStore('payees', ['payees', 'payee_mapping'], () => usePayeesStore.getState().load());
