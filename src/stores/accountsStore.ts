import { create } from 'zustand';
import {
  getAccounts,
  createAccount,
  updateAccount,
  closeAccount,
  deleteAccount,
} from '../accounts';
import type { Account } from '../accounts/types';

type AccountsState = {
  accounts: Account[];
  loading: boolean;
  load(): Promise<void>;
  create(fields: Omit<Partial<Account>, 'id' | 'tombstone'>, startingBalance?: number): Promise<string>;
  update(id: string, fields: Omit<Partial<Account>, 'id' | 'tombstone'>): Promise<void>;
  close(id: string): Promise<void>;
  delete_(id: string): Promise<void>;
};

export const useAccountsStore = create<AccountsState>((set) => ({
  accounts: [],
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const accounts = await getAccounts();
      set({ accounts });
    } finally {
      set({ loading: false });
    }
  },

  async create(fields, startingBalance = 0) {
    return createAccount(fields, startingBalance);
  },

  async update(id, fields) {
    return updateAccount(id, fields);
  },

  async close(id) {
    return closeAccount(id);
  },

  async delete_(id) {
    return deleteAccount(id);
  },
}));
