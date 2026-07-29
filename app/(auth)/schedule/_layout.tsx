import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { TRANSLUCENT_HEADER_OPTIONS } from "@/lib/hooks/screenHeaderOptions";
import { ScheduleFormProvider } from "@/screens/schedules/ScheduleDetailScreen/context/ScheduleFormProvider";

export default function ScheduleLayout() {
  const { screen } = useStackOptions();

  // The form provider wraps the whole stack so the detail screen and its
  // payee/category pickers share one schedule form instance.
  return (
    <ScheduleFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="[id]" options={{ title: "Schedule", headerShown: false }} />
        <Stack.Screen name="name" options={{ headerShown: false, presentation: "modal" }} />
        {/* Pickers run on the native header + native search bar
            (NativePickerScreen). The chrome is declared here; title, search and
            header actions come from the screen. */}
        <Stack.Screen name="payee-select" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="category-select" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="category-picker" options={TRANSLUCENT_HEADER_OPTIONS} />
      </Stack>
    </ScheduleFormProvider>
  );
}
