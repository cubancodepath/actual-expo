import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { usePickerHeaderOptions } from "@/lib/hooks/screenHeaderOptions";
import { CATEGORY_SEARCH, PAYEE_SEARCH } from "@/lib/config/pickerSearch";
import { ScheduleFormProvider } from "@/screens/schedules/ScheduleDetailScreen/context/ScheduleFormProvider";

export default function ScheduleLayout() {
  const { screen } = useStackOptions();
  const categoryOptions = usePickerHeaderOptions(CATEGORY_SEARCH);
  const payeeOptions = usePickerHeaderOptions(PAYEE_SEARCH);

  // The form provider wraps the whole stack so the detail screen and its
  // payee/category pickers share one schedule form instance.
  return (
    <ScheduleFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="[id]" options={{ title: "Schedule", headerShown: false }} />
        <Stack.Screen name="name" options={{ headerShown: false, presentation: "modal" }} />
        {/* Pickers run on the native header + native search bar
            (NativePickerScreen). These used to declare only the translucent
            header, so the first commit had no search bar at all and the screen
            attached one afterwards — the worst version of the flash. They now
            seed the same full config the screen re-declares. */}
        <Stack.Screen name="payee-select" options={payeeOptions} />
        <Stack.Screen name="category-select" options={categoryOptions} />
        <Stack.Screen name="category-picker" options={categoryOptions} />
      </Stack>
    </ScheduleFormProvider>
  );
}
