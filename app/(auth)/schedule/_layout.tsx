import { Stack } from "expo-router";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { themedScreenOptions } from "../../../src/presentation/navigation/screenOptions";

export default function ScheduleLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);

  return (
    <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="[id]" options={{ title: "Schedule", headerShown: false }} />
      <Stack.Screen name="new" options={{ title: "New Schedule", headerShown: false }} />
      <Stack.Screen name="payee-picker" options={{ headerShown: false }} />
      <Stack.Screen name="account-picker" options={{ headerShown: false }} />
      <Stack.Screen name="category-picker" options={{ headerShown: false }} />
      <Stack.Screen name="recurrence" options={{ headerShown: false }} />
      <Stack.Screen name="recurrence-custom" options={{ headerShown: false }} />
    </Stack>
  );
}
