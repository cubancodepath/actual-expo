import { Stack } from "expo-router";
import { useQuickActionRouting } from "expo-quick-actions/router";
import { useTranslation } from "react-i18next";
import { useStackOptions } from "@/lib/hooks/useStackOptions";
import { useTheme } from "@/design-system/providers/ThemeProvider";

export default function AuthLayout() {
  useQuickActionRouting();
  const { screen, modal, formSheet } = useStackOptions();
  const { t } = useTranslation();

  // LEGACY EXCEPTION — `schedules` is still a StyleSheet screen painting
  // `theme.colors.pageBackground` itself. Until it moves to HeroUI the route has
  // to keep painting the same legacy color, or a mismatched crescent shows
  // behind the sheet's rounded corners. Delete with that screen's migration.
  const legacyTheme = useTheme();

  return (
    <Stack screenOptions={screen}>
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
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="encryption-password"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen name="account/settings" options={{ headerShown: false, ...modal }} />
      <Stack.Screen name="account/close" options={{ headerShown: false, ...formSheet([1.0]) }} />
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
        options={{ headerShown: false, ...formSheet([0.45]) }}
      />
      <Stack.Screen
        name="budget/cover-source"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="budget/move-money"
        options={{ headerShown: false, ...formSheet([1.0]) }}
      />
      <Stack.Screen
        name="budget/category-picker"
        options={{
          headerShown: false,
          ...formSheet([0.5, 1.0]),
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen name="budget/hold" options={{ headerShown: false, ...formSheet([1.0]) }} />
      <Stack.Screen
        name="budget/delete-category-picker"
        options={{
          headerShown: false,
          ...modal,
        }}
      />
      <Stack.Screen
        name="schedules"
        options={{
          title: t("nav.schedules"),
          ...modal,
          // LEGACY EXCEPTION — see `legacyTheme` above.
          headerStyle: { backgroundColor: legacyTheme.colors.pageBackground },
          contentStyle: { backgroundColor: legacyTheme.colors.pageBackground },
        }}
      />
      <Stack.Screen name="schedule" options={{ headerShown: false, ...modal }} />
      <Stack.Screen
        name="settings"
        options={{ ...screen, headerShown: false, presentation: "fullScreenModal" }}
      />
      <Stack.Screen
        name="new-budget"
        options={{ ...screen, headerShown: false, presentation: "fullScreenModal" }}
      />
    </Stack>
  );
}
