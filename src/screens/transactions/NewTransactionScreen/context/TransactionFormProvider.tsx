import { createContext, use, useState, type ReactNode } from "react";
import { useAccounts } from "@/screens/transactions/hooks/useAccounts";
import { useCategories } from "@/screens/transactions/hooks/useCategories";
import { usePayees } from "@/screens/transactions/hooks/usePayees";
import { useTags } from "@/screens/transactions/hooks/useTags";
import { useRules } from "@/screens/transactions/hooks/useRules";
import { useNewTransactionForm } from "../hooks/useNewTransactionForm";

/** A category picked on the split "Add category" screen, handed back to the
 *  split-amounts screen (expo-router can't return values via `router.back()`). */
type PendingSplitCategory = { id: string; name: string } | null;

type TransactionFormContextValue = ReturnType<typeof useNewTransactionForm> & {
  groups: ReturnType<typeof useCategories>["groups"];
  payees: ReturnType<typeof usePayees>["payees"];
  tags: ReturnType<typeof useTags>["tags"];
  pendingSplitCategory: PendingSplitCategory;
  setPendingSplitCategory: (c: PendingSplitCategory) => void;
};

const TransactionFormContext = createContext<TransactionFormContextValue | null>(null);

/**
 * Holds the create/edit transaction form + reference data for the whole
 * transaction stack (the `new` screen and the payee/category picker screens),
 * so they share one form instance without prop-drilling or a global store.
 */
export function TransactionFormProvider({ children }: { children: ReactNode }) {
  // Route params are NOT read here: on this layout's first render expo-router's
  // global routeInfo still holds the PREVIOUS route's params (the leaf writes it
  // later). The `new` leaf screen reads its own params and calls `initialize`.

  // Subscribe to each data source exactly once for the whole stack.
  const { accounts } = useAccounts();
  const { categories, groups } = useCategories();
  const { payees } = usePayees();
  const { tags } = useTags();
  const { rules } = useRules();

  const formApi = useNewTransactionForm({ accounts, categories, rules });

  const [pendingSplitCategory, setPendingSplitCategory] = useState<PendingSplitCategory>(null);

  // Not memoized: `formApi` is a fresh object every render, so a useMemo here
  // would never hit. The provider itself re-renders rarely (only on a liveQuery
  // data change), so rebuilding this object is cheap.
  const value: TransactionFormContextValue = {
    ...formApi,
    groups,
    payees,
    tags,
    pendingSplitCategory,
    setPendingSplitCategory,
  };

  return (
    <TransactionFormContext.Provider value={value}>{children}</TransactionFormContext.Provider>
  );
}

export function useTransactionForm(): TransactionFormContextValue {
  const ctx = use(TransactionFormContext);
  if (!ctx) {
    throw new Error("useTransactionForm must be used within a TransactionFormProvider");
  }
  return ctx;
}
