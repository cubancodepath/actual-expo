import { create } from "zustand";

// ---------------------------------------------------------------------------
// Last transaction store — what the next "add" should start from.
// ---------------------------------------------------------------------------
// Upstream's `transactions.lastTransaction` slice, narrowed to the one field
// the mobile add flow reads. It exists so that adding a transaction from
// somewhere that knows nothing about accounts (the budget screen, the all
// transactions list) still opens with the account you last used, instead of an
// empty row you have to fill every time.
//
// Deliberately NOT persisted, matching upstream: it is Redux state there, with
// no redux-persist, and the slice returns to its initial state on `resetApp`.
// A suggestion that survives a relaunch stops being a suggestion about what you
// are doing now and becomes a stale guess about what you did last week.
//
// `resetAllStores` is our `resetApp`: the id belongs to one budget file and
// means nothing in the next one.

type LastTransactionState = {
  /** Account of the last transaction created in this session, if any. */
  accountId: string | null;
  setLastAccount(accountId: string | null): void;
  reset(): void;
};

export const useLastTransactionStore = create<LastTransactionState>((set) => ({
  accountId: null,
  setLastAccount: (accountId) => set({ accountId }),
  reset: () => set({ accountId: null }),
}));
