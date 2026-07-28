import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function BudgetStack() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={screen}>
      {/* The budget header is now a custom in-body component (BudgetHeader). */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
