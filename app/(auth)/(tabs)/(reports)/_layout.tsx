import { Stack } from "expo-router";

/**
 * Reports stack. `ReportsScreen` owns its header via the app's `ScreenHeader`,
 * so the native header is disabled here.
 */
export default function ReportsStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
