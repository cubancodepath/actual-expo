import { Stack } from "expo-router";
import { useTheme } from "../../src/presentation/providers/ThemeProvider";
import {
  themedScreenOptions,
  themedModalOptions,
} from "../../src/presentation/navigation/screenOptions";

export default function AuthLayout() {
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const modal = themedModalOptions(theme);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
      <Stack.Screen
        name="account/new"
        options={{ title: "New Account", ...modal }}
      />
      <Stack.Screen
        name="account/[id]"
        options={{ title: "", headerBackTitle: " ", ...screen }}
      />
      <Stack.Screen
        name="account/settings"
        options={{ title: "Account Settings", ...modal }}
      />
      <Stack.Screen
        name="transaction"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="categories"
        options={{ title: "Manage Categories", ...modal }}
      />
      <Stack.Screen
        name="payees"
        options={{ title: "Manage Payees", ...modal }}
      />
    </Stack>
  );
}
