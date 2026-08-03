import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function BudgetStack() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={screen}>
      {/* Native bar, opaque (the `screen` defaults). The screen itself puts the
          month picker in as `headerTitle` and the actions as bar items. */}
      <Stack.Screen name="index" />
    </Stack>
  );
}
