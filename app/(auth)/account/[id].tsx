import { useLocalSearchParams } from "expo-router";
import { AccountTransactionsScreen } from "@/screens/transactions/TransactionsListScreen";

export default function AccountTransactionsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountTransactionsScreen accountId={id} />;
}
