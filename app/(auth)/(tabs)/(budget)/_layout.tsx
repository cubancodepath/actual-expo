import { Stack } from "expo-router";
import { useTheme } from "@/design-system/providers/ThemeProvider";

export default function BudgetStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.pageBackground },
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      {/* The budget header is now a custom in-body component (BudgetHeader). */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
