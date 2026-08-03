import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { usePickerHeaderOptions } from "@/lib/hooks/screenHeaderOptions";
import { CATEGORY_SEARCH } from "@/lib/config/pickerSearch";
import { CategorizeProvider } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

export default function TransactionCategorizeLayout() {
  const { screen } = useStackOptions();
  const categoryOptions = usePickerHeaderOptions(CATEGORY_SEARCH);

  return (
    <CategorizeProvider>
      <Stack screenOptions={{ ...screen, headerShown: false }}>
        {/* Both of these are NativePickerScreen. Left on the navigator's
            `headerShown: false` their first commit had no header at all, and
            `Stack.SearchBar` forces one on in the second — so the whole bar
            popped in. Seeding the picker chrome makes the first commit the
            final one. */}
        <Stack.Screen name="index" options={categoryOptions} />
        <Stack.Screen name="split-amounts" />
        <Stack.Screen name="add-category" options={categoryOptions} />
      </Stack>
    </CategorizeProvider>
  );
}
