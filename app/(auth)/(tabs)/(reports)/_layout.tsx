import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

/**
 * Reports stack. `ReportsScreen` owns its header via the app's `ScreenHeader`,
 * so the native header is disabled here.
 */
export default function ReportsStack() {
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={{ ...screen, headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
