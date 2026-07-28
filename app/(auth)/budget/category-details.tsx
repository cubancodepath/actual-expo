import { useLocalSearchParams } from "expo-router";
import { CategoryDetailsScreen } from "@/screens/budget/CategoryDetailsScreen";
import { SurfaceLevel } from "@/ui/surface-level";

export default function CategoryDetailsRoute() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  return (
    <SurfaceLevel context="sheet">
      <CategoryDetailsScreen categoryId={categoryId} />
    </SurfaceLevel>
  );
}
