import { Stack, useRouter } from "expo-router";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { MonthSelector } from "@/features/budget/components/MonthSelector";

export default function BudgetStack() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.pageBackground },
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <MonthSelector />,
        }}
      />
    </Stack>
  );
}
