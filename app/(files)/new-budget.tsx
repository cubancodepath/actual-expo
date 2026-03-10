import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "../../src/presentation/components/budget/BudgetSetupWizard";

export default function NewBudgetScreen() {
  const router = useRouter();

  return (
    <BudgetSetupWizard
      mode="server"
      onCancel={() => router.back()}
    />
  );
}
