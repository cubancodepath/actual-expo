import { create } from 'zustand';
import { registerStore } from './storeRegistry';
import {
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
} from '../transactions';
import type { Transaction, GetTransactionsOptions } from '../transactions/types';

type TransactionsState = {
  transactions: Transaction[];
  accountId: string | null;
  loading: boolean;
  load(accountId?: string, opts?: Omit<GetTransactionsOptions, 'accountId'>): Promise<void>;
  add(txn: Omit<Partial<Transaction>, 'id' | 'tombstone'> & { acct: string; date: number; amount: number }): Promise<string>;
  update(id: string, fields: Omit<Partial<Transaction>, 'id' | 'tombstone'>): Promise<void>;
  delete_(id: string): Promise<void>;
};

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  transactions: [],
  accountId: null,
  loading: false,

  async load(accountId, opts) {
    set({ loading: true, accountId: accountId ?? null });
    try {
      const transactions = await getTransactions({ accountId, ...opts });
      set({ transactions });
    } finally {
      set({ loading: false });
    }
  },

  async add(txn) {
    return addTransaction(txn);
  },

  async update(id, fields) {
    return updateTransaction(id, fields);
  },

  async delete_(id) {
    return deleteTransaction(id);
  },
}));

registerStore('transactions', ['transactions'], () => {
  const s = useTransactionsStore.getState();
  return s.load(s.accountId ?? undefined);
});
