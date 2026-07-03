import { Stack, useRouter } from "expo-router";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { MonthPicker } from "@/features/budget/components/MonthPicker";

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
          headerTitle: () => <MonthPicker />,
        }}
      />
    </Stack>
  );
}
