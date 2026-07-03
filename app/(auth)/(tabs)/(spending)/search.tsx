import { useLocalSearchParams } from "expo-router";
import { SearchScreen } from "@/features/spending/screens/SearchScreen";

export default function SearchRoute() {
  const { initialFilter } = useLocalSearchParams<{ initialFilter?: string }>();
  return <SearchScreen initialFilter={initialFilter} />;
}
