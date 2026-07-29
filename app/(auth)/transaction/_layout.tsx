import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { HERO_HEADER_OPTIONS, TRANSLUCENT_HEADER_OPTIONS } from "@/lib/hooks/screenHeaderOptions";
import { TransactionFormProvider } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

export default function TransactionLayout() {
  const { screen } = useStackOptions();

  return (
    <TransactionFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        {/* Every screen here runs on the native header — leaving one without it
            makes the bar appear and disappear between siblings, which is the
            jump this stack used to have. The editor supplies its own title
            (it knows create vs edit) and its close button. */}
        <Stack.Screen name="new" options={HERO_HEADER_OPTIONS} />
        {/* Pickers run on the native header + native search bar
            (NativePickerScreen). The chrome is declared here; title, search and
            header actions come from the screen. */}
        <Stack.Screen name="category-picker" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="payee-select" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="category-select" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="split-amounts" options={TRANSLUCENT_HEADER_OPTIONS} />
        <Stack.Screen name="split-add-category" options={TRANSLUCENT_HEADER_OPTIONS} />
      </Stack>
    </TransactionFormProvider>
  );
}
