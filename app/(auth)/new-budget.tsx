import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "@/presentation/components/budget/BudgetSetupWizard";
import { openBudget } from "@/services/budgetfiles";
import { usePrefsStore } from "@/stores/prefsStore";

export default function NewBudgetScreen() {
  const router = useRouter();

  return (
    <BudgetSetupWizard
      mode="server"
      onCancel={() => router.back()}
      onComplete={() => {
        // The wizard already set prefs (activeBudgetId etc).
        // Open the budget and dismiss back to tabs.
        const { activeBudgetId } = usePrefsStore.getState();
        if (activeBudgetId) {
          openBudget(activeBudgetId).catch(console.warn);
        }
        router.dismissAll();
      }}
    />
  );
}
