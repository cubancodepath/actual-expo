import { Stack } from "expo-router";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { TransactionFormProvider } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

export default function TransactionLayout() {
  const { screen, formSheet } = useStackOptions();

  // LEGACY EXCEPTION — `tags` is still a StyleSheet screen painting
  // `theme.colors.pageBackground`; keep the route on the same legacy colour
  // until it migrates, or the sheet's rounded corners show a mismatch.
  const legacyTheme = useTheme();

  return (
    <TransactionFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="new" options={{ title: "New Transaction", headerShown: false }} />
        <Stack.Screen name="category-picker" options={{ headerShown: false }} />
        <Stack.Screen name="payee-select" options={{ headerShown: false }} />
        <Stack.Screen name="category-select" options={{ headerShown: false }} />
        <Stack.Screen name="split-amounts" options={{ headerShown: false }} />
        <Stack.Screen name="split-add-category" options={{ headerShown: false }} />
        <Stack.Screen name="account-picker" options={{ headerShown: false }} />
        <Stack.Screen name="split" options={{ title: "Split Transaction", headerShown: false }} />
        <Stack.Screen
          name="split-category-picker"
          options={{ title: "Category", headerShown: false }}
        />
        <Stack.Screen name="notes" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="recurrence" options={{ headerShown: false }} />
        <Stack.Screen name="recurrence-custom" options={{ headerShown: false }} />
        <Stack.Screen
          name="tags"
          options={{
            ...formSheet([0.5, 1.0]),
            title: "Tags",
            // LEGACY EXCEPTION — see `legacyTheme` above.
            headerStyle: { backgroundColor: legacyTheme.colors.pageBackground },
            contentStyle: { backgroundColor: legacyTheme.colors.pageBackground },
          }}
        />
      </Stack>
    </TransactionFormProvider>
  );
}
