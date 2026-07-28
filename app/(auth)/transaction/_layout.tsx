import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { TransactionFormProvider } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";

export default function TransactionLayout() {
  const { screen } = useStackOptions();

  return (
    <TransactionFormProvider>
      <Stack screenOptions={{ ...screen, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="new" options={{ title: "New Transaction", headerShown: false }} />
        <Stack.Screen name="category-picker" options={{ headerShown: false }} />
        <Stack.Screen name="payee-select" options={{ headerShown: false }} />
        <Stack.Screen name="category-select" options={{ headerShown: false }} />
        <Stack.Screen name="split-amounts" options={{ headerShown: false }} />
        <Stack.Screen name="split-add-category" options={{ headerShown: false }} />
      </Stack>
    </TransactionFormProvider>
  );
}
