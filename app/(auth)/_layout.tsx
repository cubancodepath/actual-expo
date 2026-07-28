import { Stack } from "expo-router";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { themedScreenOptions, themedModalOptions } from "@/lib/screenOptions";

export default function AuthLayout() {
  useQuickActionRouting();
  const theme = useTheme();
  const screen = themedScreenOptions(theme);
  const modal = themedModalOptions(theme);
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "" }} />
      <Stack.Screen name="account/new" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="account/[id]" options={{ ...screen, headerShown: false }} />
      <Stack.Screen
        name="account/search"
        options={{
          ...screen,
          animation: "fade",
          animationDuration: 150,
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="account/reconcile"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="encryption-password"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen name="account/settings" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="account/close"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen name="transaction" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="transaction-categorize" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="transaction-move" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="budget/assign-money"
        options={{ headerShown: false, ...modal, gestureEnabled: false }}
      />
      <Stack.Screen name="budget/edit" options={{ headerShown: false }} />
      <Stack.Screen name="budget/hidden-categories" options={{ headerShown: false }} />
      <Stack.Screen
        name="budget/rename-category"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="budget/category-details"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      {/* A directory route with its own nested stack (list → editor → mode),
          presented as one card modal — same arrangement as `transaction`. */}
      <Stack.Screen name="budget/goal" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="budget/category-transactions"
        options={{ ...modal, headerShown: false }}
      />
      <Stack.Screen
        name="budget/cover-overspent"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.45],
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
        name="budget/move-money"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [1.0],
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/category-picker"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.5, 1.0],
          sheetGrabberVisible: true,
          contentStyle: { backgroundColor: theme.colors.pageBackground },
        }}
      />
      <Stack.Screen
        name="budget/hold"
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
      <Stack.Screen name="schedules" options={{ title: t("nav.schedules"), ...modal }} />
      <Stack.Screen name="schedule" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="settings"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="new-budget"
        options={{ headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}
