import { Stack } from "expo-router";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useTheme } from "../../src/presentation/providers/ThemeProvider";
import {
  themedScreenOptions,
  themedModalOptions,
} from "../../src/presentation/navigation/screenOptions";

export default function AuthLayout() {
  useQuickActionRouting();
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
        name="account/search"
        options={{
          ...screen,
          animation: "fade",
          animationDuration: 150,
          headerBackVisible: false,
          headerLeft: () => null,
        }}
      />
      <Stack.Screen
        name="account/reconcile"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="account/settings"
        options={{ title: "Account Settings", ...modal }}
      />
      <Stack.Screen
        name="account/close"
        options={{
          ...screen,
          title: "Close Account",
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="transaction"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="budget/assign"
        options={{ title: "Assign Budget", ...modal }}
      />
      <Stack.Screen name="budget/edit" options={{ headerShown: false }} />
      <Stack.Screen
        name="budget/reorder"
        options={{
          ...screen,
          title: "Reorder",
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/new-group"
        options={{
          ...screen,
          title: "New Group",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/new-category"
        options={{
          ...screen,
          title: "New Category",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/rename-category"
        options={{
          ...screen,
          title: "Rename Category",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/quick-edit-category"
        options={{
          ...screen,
          title: "Edit Category",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/edit-group"
        options={{
          ...screen,
          title: "Edit Group",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/edit-category"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/goal"
        options={{
          ...screen,
          title: "Goal Target",
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/cover-overspent"
        options={{
          ...screen,
          title: "Overspent Categories",
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/cover-source"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/cover-category-picker"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/hold"
        options={{
          ...screen,
          title: "Hold for Next Month",
          presentation: "formSheet",
          sheetAllowedDetents: [0.45],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/move-money"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/delete-category-picker"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/move-category-picker"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="categories"
        options={{ title: "Manage Categories", ...modal }}
      />
      <Stack.Screen
        name="payees"
        options={{ title: "Manage Payees", ...modal }}
      />
      <Stack.Screen
        name="schedules"
        options={{ title: "Schedules", ...modal }}
      />
      <Stack.Screen
        name="schedule"
        options={{ headerShown: false, ...modal }}
      />
      <Stack.Screen
        name="change-budget"
        options={{ title: "Change Budget", ...modal }}
      />
      <Stack.Screen name="settings" options={{ title: "Settings", ...modal }} />
    </Stack>
  );
}
