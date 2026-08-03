import { useLocalSearchParams } from "expo-router";
import { SearchScreen } from "@/screens/transactions/search/SearchScreen";

export default function AccountSearchRoute() {
  const { accountId, initialFilter } = useLocalSearchParams<{
    accountId: string;
    initialFilter?: string;
  }>();
  return <SearchScreen accountId={accountId} initialFilter={initialFilter} />;
}
