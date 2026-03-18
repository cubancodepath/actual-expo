import { Stack } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";

export default function TestStack() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.pageBackground },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}
