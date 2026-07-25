import { useRouter } from "expo-router";
import { NewBudgetScreen } from "@/screens/auth/NewBudgetScreen";

export default function NewBudget() {
  const router = useRouter();

  return <NewBudgetScreen mode="server" onCancel={() => router.back()} />;
}
