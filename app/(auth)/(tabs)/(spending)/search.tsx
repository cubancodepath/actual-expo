import { useLocalSearchParams } from "expo-router";
import { SearchScreen } from "@/screens/transactions/search/SearchScreen";

export default function SearchRoute() {
  const { initialFilter } = useLocalSearchParams<{ initialFilter?: string }>();
  return <SearchScreen initialFilter={initialFilter} />;
}
