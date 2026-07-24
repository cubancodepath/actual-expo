import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "@/screens/auth/components/BudgetSetupWizard";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { loadBudget } from "@/stores/operations/budgetfiles";

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
          loadBudget(activeBudgetId).catch(console.warn);
        }
        router.dismissAll();
      }}
    />
  );
}
