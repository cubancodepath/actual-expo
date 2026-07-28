import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";

export default function SettingsLayout() {
  // Presented as a `fullScreenModal` — it covers everything, so it IS the
  // canvas and stays on the base `screen` rung.
  const { screen } = useStackOptions();

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
      {/* Migrated to HeroUI — each screen renders its own ScreenHeader. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="display" options={{ headerShown: false }} />
      <Stack.Screen name="language" options={{ headerShown: false }} />
      <Stack.Screen name="budget" options={{ headerShown: false }} />
      <Stack.Screen name="number-format" options={{ headerShown: false }} />
      <Stack.Screen name="date-format" options={{ headerShown: false }} />
      <Stack.Screen name="first-day-of-week" options={{ headerShown: false }} />
      <Stack.Screen name="currency" options={{ headerShown: false }} />
      <Stack.Screen name="symbol-position" options={{ headerShown: false }} />
      <Stack.Screen name="advanced" options={{ headerShown: false }} />
      <Stack.Screen name="change-budget" options={{ headerShown: false }} />
    </Stack>
  );
}
