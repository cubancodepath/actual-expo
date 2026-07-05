import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "@/features/budget/components/BudgetSetupWizard";
import { openBudget } from "@/services/budgetfiles";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

export default function NewBudgetScreen() {
  const router = useRouter();

  return (
    <BudgetSetupWizard
      mode="server"
      onCancel={() => router.back()}
      onComplete={() => {
        // The wizard already set prefs (activeBudgetId etc).
        // Open the budget and dismiss back to tabs.
        const { activeBudgetId } = useBudgetContextStore.getState();
        if (activeBudgetId) {
          openBudget(activeBudgetId).catch(console.warn);
        }
        router.dismissAll();
      }}
    />
  );
}
