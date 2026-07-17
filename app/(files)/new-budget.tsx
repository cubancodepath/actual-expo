import { useRouter } from "expo-router";
import { BudgetSetupWizard } from "@/screens/auth/components/BudgetSetupWizard";

export default function NewBudgetScreen() {
  const router = useRouter();

  return <BudgetSetupWizard mode="server" onCancel={() => router.back()} />;
}
