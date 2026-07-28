import { Stack } from "expo-router";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { CategorizeProvider } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

export default function TransactionCategorizeLayout() {
  const { screen } = useStackOptions();

  return (
    <CategorizeProvider>
      <Stack screenOptions={{ ...screen, headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="split-amounts" />
        <Stack.Screen name="add-category" />
      </Stack>
    </CategorizeProvider>
  );
}
