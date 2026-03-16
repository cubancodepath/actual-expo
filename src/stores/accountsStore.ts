import { create } from "zustand";
import { registerStore } from "./storeRegistry";
import {
  getAccounts,
  createAccount,
  updateAccount,
  closeAccount,
  type CloseAccountOpts,
} from "../accounts";
import type { Account } from "../accounts/types";

type AccountsState = {
  accounts: Account[];
  loading: boolean;
  load(): Promise<void>;
  create(
    fields: Omit<Partial<Account>, "id" | "tombstone">,
    startingBalance?: number,
  ): Promise<string>;
  update(id: string, fields: Omit<Partial<Account>, "id" | "tombstone">): Promise<void>;
  close(opts: CloseAccountOpts): Promise<void>;
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

  async close(opts) {
    return closeAccount(opts);
  },
}));

registerStore("accounts", ["accounts"], () => useAccountsStore.getState().load());
