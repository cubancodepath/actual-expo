import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import {
  HERO_HEADER_OPTIONS,
  TRANSLUCENT_HEADER_OPTIONS,
  usePickerHeaderOptions,
} from "@/lib/hooks/screenHeaderOptions";
import { CATEGORY_SEARCH, PAYEE_SEARCH } from "@/lib/config/pickerSearch";
import { TransactionFormProvider } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

export default function TransactionLayout() {
  const { screen } = useStackOptions();
  const categoryOptions = usePickerHeaderOptions(CATEGORY_SEARCH);
  const payeeOptions = usePickerHeaderOptions(PAYEE_SEARCH);

  return (
    <TransactionFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        {/* Every screen here runs on the native header — leaving one without it
            makes the bar appear and disappear between siblings, which is the
            jump this stack used to have. The editor supplies its own title
            (it knows create vs edit) and its close button. */}
        <Stack.Screen name="new" options={HERO_HEADER_OPTIONS} />
        {/* Pickers run on the native header + native search bar
            (NativePickerScreen). The bar is declared here so the first native
            commit already has the final one — the screen re-declares the same
            config from the same object, so its pass changes nothing. See
            usePickerHeaderOptions. Title and actions come from the screen. */}
        <Stack.Screen name="category-picker" options={categoryOptions} />
        <Stack.Screen name="payee-select" options={payeeOptions} />
        <Stack.Screen name="category-select" options={categoryOptions} />
        <Stack.Screen name="split-amounts" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="split-add-category" options={categoryOptions} />
      </Stack>
    </TransactionFormProvider>
  );
}
