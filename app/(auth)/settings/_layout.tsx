import { Stack } from "expo-router";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { themedScreenOptions } from "@/lib/screenOptions";

export default function SettingsLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);

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
    </Stack>
  );
}
