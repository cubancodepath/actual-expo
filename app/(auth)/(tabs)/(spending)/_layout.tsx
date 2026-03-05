import { Stack } from "expo-router";
import { useTheme } from "../../../../src/presentation/providers/ThemeProvider";

export default function SpendingStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.headerText,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Spending" }} />
    </Stack>
  );
}
