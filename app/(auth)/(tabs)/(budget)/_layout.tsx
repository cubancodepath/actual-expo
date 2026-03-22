import { Stack, useRouter } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { MonthSelector } from "@/presentation/components/budget/MonthSelector";

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
