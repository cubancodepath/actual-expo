import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";
import { CategorizeProvider } from "@/screens/transactions/CategorizeScreen/context/CategorizeProvider";

export default function TransactionCategorizeLayout() {
  const background = useThemeColor("background");

  return (
    <CategorizeProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="split-amounts" />
        <Stack.Screen name="add-category" />
      </Stack>
    </CategorizeProvider>
  );
}
