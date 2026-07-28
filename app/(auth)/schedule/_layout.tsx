import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { SurfaceLevel } from "@/ui/surface-level";
import { ScheduleFormProvider } from "@/screens/schedules/ScheduleDetailScreen/context/ScheduleFormProvider";

export default function ScheduleLayout() {
  // Presented as a card `modal` from `(auth)/_layout.tsx` — the `sheet` rung.
  const { sheet } = useStackOptions();

  // The form provider wraps the whole stack so the detail screen and its
  // payee/category pickers share one schedule form instance.
  return (
    <ScheduleFormProvider>
      <SurfaceLevel context="sheet">
        <Stack screenOptions={{ ...sheet, headerBackButtonDisplayMode: "minimal" }}>
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
      </SurfaceLevel>
    </ScheduleFormProvider>
  );
}
