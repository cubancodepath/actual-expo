import { createContext, use, type ReactNode } from "react";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useCategories } from "@/ui/hooks/useCategories";
import { usePayees } from "@/lib/hooks/usePayees";
import { useScheduleForm } from "../hooks/useScheduleForm";

type ScheduleFormContextValue = ReturnType<typeof useScheduleForm> & {
  groups: ReturnType<typeof useCategories>["groups"];
};

const ScheduleFormContext = createContext<ScheduleFormContextValue | null>(null);

/**
 * Holds the edit-schedule form + reference data for the whole schedule stack
 * (the detail screen and its payee/category picker screens), so they share one
 * form instance without prop-drilling or a global store. Mirrors
 * TransactionFormProvider.
 */
export function ScheduleFormProvider({ children }: { children: ReactNode }) {
  const { accounts } = useAccounts();
  const { categories, groups } = useCategories();
  const { payees } = usePayees();

  const formApi = useScheduleForm({ accounts, categories, payees });

  const value: ScheduleFormContextValue = { ...formApi, groups };

  return <ScheduleFormContext.Provider value={value}>{children}</ScheduleFormContext.Provider>;
}

export function useScheduleFormContext(): ScheduleFormContextValue {
  const ctx = use(ScheduleFormContext);
  if (!ctx) {
    throw new Error("useScheduleFormContext must be used within a ScheduleFormProvider");
  }
  return ctx;
}
