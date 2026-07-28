import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { ScheduleFormProvider } from "@/screens/schedules/ScheduleDetailScreen/context/ScheduleFormProvider";

export default function ScheduleLayout() {
  const { screen } = useStackOptions();

  // The form provider wraps the whole stack so the detail screen and its
  // payee/category pickers share one schedule form instance.
  return (
    <ScheduleFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="[id]" options={{ title: "Schedule", headerShown: false }} />
        <Stack.Screen name="new" options={{ title: "New Schedule", headerShown: false }} />
        <Stack.Screen name="name" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="payee-select" options={{ headerShown: false }} />
        <Stack.Screen name="category-select" options={{ headerShown: false }} />
        <Stack.Screen name="account-picker" options={{ headerShown: false }} />
        <Stack.Screen name="category-picker" options={{ headerShown: false }} />
        <Stack.Screen name="recurrence" options={{ headerShown: false }} />
        <Stack.Screen name="recurrence-custom" options={{ headerShown: false }} />
      </Stack>
    </ScheduleFormProvider>
  );
}
