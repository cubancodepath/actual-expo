import { Stack } from "expo-router";
import { useTheme } from "@/presentation/providers/ThemeProvider";

export default function BankSyncLayout() {
  const theme = useTheme();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
    </Stack>
  );
}
