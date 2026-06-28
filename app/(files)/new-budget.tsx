import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "@/features/budget/components/BudgetSetupWizard";

export default function NewBudgetScreen() {
  const router = useRouter();

  return <BudgetSetupWizard mode="server" onCancel={() => router.back()} />;
}
